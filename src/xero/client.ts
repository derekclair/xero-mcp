/**
 * Thin Xero Accounting + Identity API client for Cloudflare Workers.
 * Prefer raw fetch over heavy SDKs for bundle size and control.
 */

import type { Props, XeroConnection } from "../auth/props";
import { refreshUpstreamToken } from "../utils";
import { parseXeroErrorResponse, XeroApiError } from "./errors";

const ACCOUNTING_BASE = "https://api.xero.com/api.xro/2.0";
const CONNECTIONS_URL = "https://api.xero.com/connections";

export type RequestOptions = {
	query?: Record<string, string | number | boolean | undefined | null>;
	body?: unknown;
	headers?: Record<string, string>;
	/** When true, skip tenant header (connections, some identity calls) */
	skipTenant?: boolean;
	idempotencyKey?: string;
	accept?: string;
	/** Raw body for attachments etc. */
	rawBody?: ArrayBuffer | string;
	contentType?: string;
};

export type TokenUpdate = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	scopes?: string;
};

export class XeroClient {
	private accessToken: string;
	private refreshToken: string;
	private expiresAt: number;
	private tenantId: string | null;
	private scopes: string;
	private onTokenRefresh?: (update: TokenUpdate) => void | Promise<void>;

	constructor(
		private env: {
			XERO_CLIENT_ID: string;
			XERO_CLIENT_SECRET: string;
		},
		props: Pick<
			Props,
			"accessToken" | "refreshToken" | "expiresAt" | "activeTenantId" | "scopes"
		>,
		opts?: { onTokenRefresh?: (update: TokenUpdate) => void | Promise<void> },
	) {
		this.accessToken = props.accessToken;
		this.refreshToken = props.refreshToken;
		this.expiresAt = props.expiresAt;
		this.tenantId = props.activeTenantId;
		this.scopes = props.scopes;
		this.onTokenRefresh = opts?.onTokenRefresh;
	}

	getGrantedScopes(): string {
		return this.scopes;
	}

	getActiveTenantId(): string | null {
		return this.tenantId;
	}

	setActiveTenantId(tenantId: string | null) {
		this.tenantId = tenantId;
	}

	async listConnections(): Promise<XeroConnection[]> {
		const data = await this.request<XeroConnection[]>("GET", CONNECTIONS_URL, {
			skipTenant: true,
			absolute: true,
		});
		return data;
	}

	/**
	 * Validate tenant is in the user's authorised connections.
	 */
	async assertTenantAllowed(tenantId: string): Promise<XeroConnection> {
		const connections = await this.listConnections();
		const found = connections.find((c) => c.tenantId === tenantId);
		if (!found) {
			throw new XeroApiError(
				`Tenant ${tenantId} is not in your authorised Xero connections. Call list_organisations and set_active_organisation.`,
				403,
				"tenant_not_authorised",
			);
		}
		return found;
	}

	async request<T = unknown>(
		method: string,
		path: string,
		options: RequestOptions & { absolute?: boolean } = {},
	): Promise<T> {
		await this.ensureFreshToken();

		const url = options.absolute
			? new URL(path)
			: new URL(path.startsWith("http") ? path : `${ACCOUNTING_BASE}${path.startsWith("/") ? "" : "/"}${path}`);

		if (options.query) {
			for (const [k, v] of Object.entries(options.query)) {
				if (v === undefined || v === null || v === "") continue;
				url.searchParams.set(k, String(v));
			}
		}

		const headers: Record<string, string> = {
			Authorization: `Bearer ${this.accessToken}`,
			Accept: options.accept ?? "application/json",
			...options.headers,
		};

		if (!options.skipTenant) {
			if (!this.tenantId) {
				throw new XeroApiError(
					"No active Xero organisation selected. Call list_organisations then set_active_organisation.",
					400,
					"missing_tenant",
				);
			}
			headers["xero-tenant-id"] = this.tenantId;
		}

		if (options.idempotencyKey) {
			headers["Idempotency-Key"] = options.idempotencyKey;
		}

		let body: BodyInit | undefined;
		if (options.rawBody !== undefined) {
			body = options.rawBody;
			if (options.contentType) headers["Content-Type"] = options.contentType;
		} else if (options.body !== undefined) {
			headers["Content-Type"] = "application/json";
			body = JSON.stringify(options.body);
		}

		let resp = await fetch(url.toString(), { method, headers, body });

		// One refresh retry on 401
		if (resp.status === 401) {
			await this.refreshTokens();
			headers.Authorization = `Bearer ${this.accessToken}`;
			resp = await fetch(url.toString(), { method, headers, body });
		}

		if (resp.status === 429) {
			const retryAfter = resp.headers.get("Retry-After") ?? "unknown";
			throw new XeroApiError(
				`Xero rate limit exceeded. Retry-After: ${retryAfter}`,
				429,
				"rate_limited",
			);
		}

		if (!resp.ok) {
			throw await parseXeroErrorResponse(resp.status, resp);
		}

		if (resp.status === 204) {
			return undefined as T;
		}

		const contentType = resp.headers.get("Content-Type") || "";
		if (contentType.includes("application/pdf") || contentType.includes("octet-stream")) {
			const buf = await resp.arrayBuffer();
			return {
				contentType,
				base64: arrayBufferToBase64(buf),
				byteLength: buf.byteLength,
			} as T;
		}

		const text = await resp.text();
		if (!text) return undefined as T;
		return JSON.parse(text) as T;
	}

	private async ensureFreshToken() {
		// Refresh 60s early
		if (Date.now() < this.expiresAt - 60_000) return;
		await this.refreshTokens();
	}

	private async refreshTokens() {
		const tokens = await refreshUpstreamToken({
			client_id: this.env.XERO_CLIENT_ID,
			client_secret: this.env.XERO_CLIENT_SECRET,
			refresh_token: this.refreshToken,
		});
		this.accessToken = tokens.access_token;
		this.refreshToken = tokens.refresh_token ?? this.refreshToken;
		this.expiresAt = Date.now() + (tokens.expires_in ?? 1800) * 1000;
		if (tokens.scope) this.scopes = tokens.scope;
		await this.onTokenRefresh?.({
			accessToken: this.accessToken,
			refreshToken: this.refreshToken,
			expiresAt: this.expiresAt,
			scopes: this.scopes,
		});
	}
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

/**
 * Resolve effective tenant: explicit param must be authorised; else active session tenant.
 */
export async function resolveTenant(
	client: XeroClient,
	tenantId?: string | null,
): Promise<string> {
	if (tenantId) {
		await client.assertTenantAllowed(tenantId);
		return tenantId;
	}
	const active = client.getActiveTenantId();
	if (!active) {
		throw new XeroApiError(
			"No active organisation. Call list_organisations and set_active_organisation first.",
			400,
			"missing_tenant",
		);
	}
	return active;
}
