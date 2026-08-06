import { env } from "cloudflare:workers";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { Hono } from "hono";
import type { Props, XeroConnection } from "./props";
import {
	type ScopePreset,
	scopeBullets,
	scopeString,
} from "./scopes";
import {
	decodeJwtPayload,
	fetchUpstreamAuthToken,
	getUpstreamAuthorizeUrl,
} from "../utils";
import {
	addApprovedClient,
	bindStateToSession,
	createOAuthState,
	generateCSRFProtection,
	isClientApproved,
	OAuthError,
	sanitizeText,
	sanitizeUrl,
	validateCSRFToken,
	validateOAuthState,
} from "../workers-oauth-utils";

const XERO_AUTHORIZE = "https://login.xero.com/identity/connect/authorize";
const XERO_TOKEN = "https://identity.xero.com/connect/token";
const XERO_CONNECTIONS = "https://api.xero.com/connections";

const app = new Hono<{ Bindings: Env & { OAUTH_PROVIDER: OAuthHelpers } }>();

app.get("/", (c) => {
	const name = c.env.MCP_SERVER_NAME || "xero-mcp";
	return c.html(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${sanitizeText(name)}</title>
<style>body{font-family:system-ui;max-width:40rem;margin:2rem auto;padding:0 1rem;line-height:1.5}
code{background:#f4f4f5;padding:.1rem .3rem;border-radius:4px}</style>
</head><body>
<h1>${sanitizeText(name)}</h1>
<p>Remote MCP server for Xero Accounting (AR, AP, banking, payments, reports).</p>
<ul>
<li>MCP endpoint: <code>/mcp</code></li>
<li>OAuth: <code>/authorize</code>, <code>/token</code>, <code>/register</code></li>
<li>Health: <code>/health</code></li>
</ul>
<p><strong>Permissions first:</strong> consent chooses read-only or read+write granular Xero scopes.
Tools are gated by granted scopes and the connected user's organisation role.</p>
</body></html>`);
});

app.get("/health", (c) => c.json({ ok: true, service: c.env.MCP_SERVER_NAME || "xero-mcp" }));

app.get("/authorize", async (c) => {
	const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
	const { clientId } = oauthReqInfo;
	if (!clientId) {
		return c.text("Invalid request", 400);
	}

	// Already approved: still show scope preset? Prefer re-showing consent for accounting sensitivity.
	// Skip only if cookie approved AND query skip_consent=1 (not default).
	const skipConsent =
		c.req.query("skip_consent") === "1" &&
		(await isClientApproved(c.req.raw, clientId, env.COOKIE_ENCRYPTION_KEY));

	if (skipConsent) {
		const { stateToken } = await createOAuthState(oauthReqInfo, c.env.OAUTH_KV);
		// Store default preset readwrite only if previously approved with skip — use read as safer default
		await c.env.OAUTH_KV.put(
			`oauth:preset:${stateToken}`,
			"read",
			{ expirationTtl: 600 },
		);
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);
		return redirectToXero(c.req.raw, stateToken, "read", {
			"Set-Cookie": sessionBindingCookie,
		});
	}

	const { token: csrfToken, setCookie } = generateCSRFProtection();
	const client = await c.env.OAUTH_PROVIDER.lookupClient(clientId);
	return renderXeroConsentDialog(c.req.raw, {
		clientName: client?.clientName ?? "MCP Client",
		clientUri: client?.clientUri ?? "",
		csrfToken,
		setCookie,
		oauthReqInfo,
	});
});

app.post("/authorize", async (c) => {
	try {
		const formData = await c.req.raw.formData();
		validateCSRFToken(formData, c.req.raw);

		const encodedState = formData.get("state");
		if (!encodedState || typeof encodedState !== "string") {
			return c.text("Missing state in form data", 400);
		}

		let state: { oauthReqInfo?: AuthRequest };
		try {
			state = JSON.parse(atob(encodedState));
		} catch {
			return c.text("Invalid state data", 400);
		}

		if (!state.oauthReqInfo?.clientId) {
			return c.text("Invalid request", 400);
		}

		const presetRaw = formData.get("scope_preset");
		const preset: ScopePreset =
			presetRaw === "readwrite" ? "readwrite" : "read";

		const approvedClientCookie = await addApprovedClient(
			c.req.raw,
			state.oauthReqInfo.clientId,
			c.env.COOKIE_ENCRYPTION_KEY,
		);

		const { stateToken } = await createOAuthState(state.oauthReqInfo, c.env.OAUTH_KV);
		await c.env.OAUTH_KV.put(`oauth:preset:${stateToken}`, preset, {
			expirationTtl: 600,
		});
		const { setCookie: sessionBindingCookie } = await bindStateToSession(stateToken);

		const headers = new Headers();
		headers.append("Set-Cookie", approvedClientCookie);
		headers.append("Set-Cookie", sessionBindingCookie);

		return redirectToXero(
			c.req.raw,
			stateToken,
			preset,
			Object.fromEntries(headers),
		);
	} catch (error: unknown) {
		console.error("POST /authorize error:", error instanceof Error ? error.message : error);
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		return c.text("Internal server error", 500);
	}
});

async function redirectToXero(
	request: Request,
	stateToken: string,
	preset: ScopePreset,
	headers: Record<string, string> = {},
) {
	const scope = scopeString(preset, env.XERO_SCOPES_OVERRIDE);
	return new Response(null, {
		status: 302,
		headers: {
			...headers,
			location: getUpstreamAuthorizeUrl({
				client_id: env.XERO_CLIENT_ID,
				redirect_uri: new URL("/callback", request.url).href,
				scope,
				state: stateToken,
				upstream_url: XERO_AUTHORIZE,
			}),
		},
	});
}

app.get("/callback", async (c) => {
	let oauthReqInfo: AuthRequest;
	let clearSessionCookie: string;

	try {
		const result = await validateOAuthState(c.req.raw, c.env.OAUTH_KV);
		oauthReqInfo = result.oauthReqInfo;
		clearSessionCookie = result.clearCookie;
	} catch (error: unknown) {
		if (error instanceof OAuthError) {
			return error.toResponse();
		}
		return c.text("Internal server error", 500);
	}

	if (!oauthReqInfo.clientId) {
		return c.text("Invalid OAuth request data", 400);
	}

	const stateToken = new URL(c.req.url).searchParams.get("state") || "";
	const preset = ((await c.env.OAUTH_KV.get(`oauth:preset:${stateToken}`)) ||
		"read") as ScopePreset;
	if (stateToken) {
		await c.env.OAUTH_KV.delete(`oauth:preset:${stateToken}`);
	}

	const [tokens, errResponse] = await fetchUpstreamAuthToken({
		client_id: c.env.XERO_CLIENT_ID,
		client_secret: c.env.XERO_CLIENT_SECRET,
		code: c.req.query("code"),
		redirect_uri: new URL("/callback", c.req.url).href,
		upstream_url: XERO_TOKEN,
	});
	if (errResponse) return errResponse;

	// Identity from id_token claims
	const claims = tokens.id_token
		? decodeJwtPayload(tokens.id_token)
		: decodeJwtPayload(tokens.access_token);

	const email =
		(typeof claims.email === "string" && claims.email) ||
		(typeof claims.preferred_username === "string" && claims.preferred_username) ||
		"";
	const name =
		(typeof claims.name === "string" && claims.name) ||
		email ||
		"Xero User";
	const login =
		(typeof claims.xero_userid === "string" && claims.xero_userid) ||
		(typeof claims.sub === "string" && claims.sub) ||
		email ||
		"xero-user";

	// Connections (organisations)
	let connections: XeroConnection[] = [];
	try {
		const connResp = await fetch(XERO_CONNECTIONS, {
			headers: { Authorization: `Bearer ${tokens.access_token}` },
		});
		if (connResp.ok) {
			connections = (await connResp.json()) as XeroConnection[];
		} else {
			console.error("Failed to load Xero connections", connResp.status);
		}
	} catch (e) {
		console.error("Connections fetch error", e instanceof Error ? e.message : e);
	}

	const activeTenantId =
		connections.length === 1 ? connections[0].tenantId : null;

	const props: Props = {
		login,
		name,
		email,
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		expiresAt: Date.now() + (tokens.expires_in ?? 1800) * 1000,
		scopes: tokens.scope ?? scopeString(preset, c.env.XERO_SCOPES_OVERRIDE),
		connections,
		activeTenantId,
		scopePreset: preset,
	};

	const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
		metadata: {
			label: name,
		},
		props,
		request: oauthReqInfo,
		scope: oauthReqInfo.scope,
		userId: login,
	});

	const headers = new Headers({ Location: redirectTo });
	if (clearSessionCookie) {
		headers.set("Set-Cookie", clearSessionCookie);
	}

	return new Response(null, { status: 302, headers });
});

function renderXeroConsentDialog(
	request: Request,
	opts: {
		clientName: string;
		clientUri: string;
		csrfToken: string;
		setCookie: string;
		oauthReqInfo: AuthRequest;
	},
): Response {
	const clientName = sanitizeText(opts.clientName);
	const clientUri = opts.clientUri
		? sanitizeText(sanitizeUrl(opts.clientUri))
		: "";
	const encodedState = btoa(JSON.stringify({ oauthReqInfo: opts.oauthReqInfo }));
	const readBullets = scopeBullets("read")
		.map((b) => `<li>${sanitizeText(b)}</li>`)
		.join("");
	const writeBullets = scopeBullets("readwrite")
		.map((b) => `<li>${sanitizeText(b)}</li>`)
		.join("");

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Authorize ${clientName} — Xero MCP</title>
  <style>
    :root { --primary:#13b5ea; --text:#1a1a1a; --muted:#555; --border:#e5e7eb; --bg:#f8fafc; }
    body { font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); margin:0; line-height:1.5; }
    .wrap { max-width: 640px; margin: 2rem auto; padding: 0 1rem; }
    .card { background:#fff; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,.08); padding:1.75rem; }
    h1 { font-size:1.35rem; margin:0 0 .5rem; }
    p.muted { color: var(--muted); }
    .client { border:1px solid var(--border); border-radius:8px; padding:1rem; margin:1rem 0; }
    .preset { border:1px solid var(--border); border-radius:8px; padding:1rem; margin:.75rem 0; cursor:pointer; }
    .preset:has(input:checked) { border-color: var(--primary); background:#f0fbff; }
    .preset strong { display:block; margin-bottom:.35rem; }
    .preset ul { margin:.5rem 0 0; padding-left:1.2rem; font-size:.9rem; color:var(--muted); }
    .actions { display:flex; gap:1rem; justify-content:flex-end; margin-top:1.5rem; }
    button { padding:.7rem 1.25rem; border-radius:8px; font-size:1rem; cursor:pointer; }
    .primary { background:var(--primary); color:#fff; border:none; font-weight:600; }
    .secondary { background:transparent; border:1px solid var(--border); }
    .warn { font-size:.85rem; color:#92400e; background:#fffbeb; border:1px solid #fcd34d; border-radius:8px; padding:.75rem; margin-top:1rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Connect Xero to <strong>${clientName}</strong></h1>
      <p class="muted">Xero MCP will access your Xero organisation using only the permissions you choose below.
      Your Xero user role still applies — the agent cannot exceed what your account can do.</p>
      <div class="client">
        <div><strong>MCP client:</strong> ${clientName}</div>
        ${clientUri ? `<div class="muted" style="font-size:.85rem;margin-top:.35rem"><a href="${clientUri}" rel="noopener noreferrer" target="_blank">${clientUri}</a></div>` : ""}
      </div>
      <form method="post" action="${sanitizeText(new URL(request.url).pathname)}">
        <input type="hidden" name="state" value="${encodedState}"/>
        <input type="hidden" name="csrf_token" value="${sanitizeText(opts.csrfToken)}"/>
        <p><strong>Permission level</strong> (least privilege recommended)</p>
        <label class="preset">
          <input type="radio" name="scope_preset" value="read" checked/>
          <strong>Read only</strong> — reports, lists, and inspection (recommended default)
          <ul>${readBullets}</ul>
        </label>
        <label class="preset">
          <input type="radio" name="scope_preset" value="readwrite"/>
          <strong>Read + write</strong> — create/update invoices, bills, payments, bank transactions
          <ul>${writeBullets}</ul>
        </label>
        <div class="warn">
          Accounting data is sensitive. Prefer <strong>Read only</strong> unless the agent must create or change transactions.
          Writes default to DRAFT where possible; destructive actions require explicit confirmation in tools.
        </div>
        <div class="actions">
          <button type="button" class="secondary" onclick="window.history.back()">Cancel</button>
          <button type="submit" class="primary">Continue to Xero</button>
        </div>
      </form>
    </div>
  </div>
</body>
</html>`;

	return new Response(html, {
		headers: {
			"Content-Type": "text/html; charset=utf-8",
			"Content-Security-Policy":
				"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
			"X-Frame-Options": "DENY",
			"X-Content-Type-Options": "nosniff",
			"Set-Cookie": opts.setCookie,
		},
	});
}

export { app as XeroHandler };
