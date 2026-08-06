/**
 * Upstream OAuth helpers (Xero identity).
 */

export type XeroTokenResponse = {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	token_type: string;
	scope?: string;
	id_token?: string;
};

/**
 * Constructs an authorization URL for Xero (or any upstream OAuth authorize endpoint).
 */
export function getUpstreamAuthorizeUrl({
	upstream_url,
	client_id,
	scope,
	redirect_uri,
	state,
}: {
	upstream_url: string;
	client_id: string;
	scope: string;
	redirect_uri: string;
	state?: string;
}): string {
	const upstream = new URL(upstream_url);
	upstream.searchParams.set("client_id", client_id);
	upstream.searchParams.set("redirect_uri", redirect_uri);
	upstream.searchParams.set("scope", scope);
	upstream.searchParams.set("response_type", "code");
	if (state) upstream.searchParams.set("state", state);
	return upstream.href;
}

/**
 * Exchange authorization code for tokens (Xero returns JSON).
 */
export async function fetchUpstreamAuthToken({
	client_id,
	client_secret,
	code,
	redirect_uri,
	upstream_url,
}: {
	code: string | undefined;
	upstream_url: string;
	client_secret: string;
	redirect_uri: string;
	client_id: string;
}): Promise<[XeroTokenResponse, null] | [null, Response]> {
	if (!code) {
		return [null, new Response("Missing code", { status: 400 })];
	}

	const basic = btoa(`${client_id}:${client_secret}`);
	const resp = await fetch(upstream_url, {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri,
		}).toString(),
	});

	if (!resp.ok) {
		const text = await resp.text();
		console.error("Xero token exchange failed", resp.status, text.slice(0, 200));
		return [null, new Response("Failed to fetch access token from Xero", { status: 500 })];
	}

	const body = (await resp.json()) as XeroTokenResponse;
	if (!body.access_token || !body.refresh_token) {
		return [null, new Response("Missing tokens in Xero response", { status: 400 })];
	}
	return [body, null];
}

/**
 * Refresh Xero access token using refresh_token.
 */
export async function refreshUpstreamToken({
	client_id,
	client_secret,
	refresh_token,
	upstream_url = "https://identity.xero.com/connect/token",
}: {
	client_id: string;
	client_secret: string;
	refresh_token: string;
	upstream_url?: string;
}): Promise<XeroTokenResponse> {
	const basic = btoa(`${client_id}:${client_secret}`);
	const resp = await fetch(upstream_url, {
		method: "POST",
		headers: {
			Authorization: `Basic ${basic}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token,
		}).toString(),
	});

	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(`Xero token refresh failed: ${resp.status} ${text.slice(0, 200)}`);
	}

	return (await resp.json()) as XeroTokenResponse;
}

/**
 * Decode JWT payload (id_token / access_token claims) without verification.
 * Used only to extract display claims after token endpoint validation.
 */
export function decodeJwtPayload(token: string): Record<string, unknown> {
	const parts = token.split(".");
	if (parts.length < 2) return {};
	try {
		const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return {};
	}
}
