import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import type { Props } from "./auth/props";
import { XeroHandler } from "./auth/xero-handler";
import { registerAllTools } from "./mcp/register-tools";
import { XeroClient } from "./xero/client";

type SessionTokens = {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
	scopes: string;
	activeTenantId: string | null;
};

/**
 * Xero Accounting MCP agent (Durable Object).
 * Tools are gated by granted OAuth scopes; tenant isolation via xero-tenant-id.
 */
export class XeroMCP extends McpAgent<Env, Record<string, never>, Props> {
	server = new McpServer({
		name: "xero-mcp",
		version: "0.1.0",
	});

	private session: SessionTokens | null = null;

	async init() {
		const props = this.props!;
		// Seed session from OAuth props; DO storage holds rotated refresh tokens
		const stored = await this.ctx.storage.get<SessionTokens>("session");
		this.session = stored ?? {
			accessToken: props.accessToken,
			refreshToken: props.refreshToken,
			expiresAt: props.expiresAt,
			scopes: props.scopes,
			activeTenantId: props.activeTenantId,
		};

		// If props have newer tokens (re-auth), prefer them
		if (!stored || (props.expiresAt && props.expiresAt > (stored.expiresAt || 0))) {
			if (
				props.accessToken &&
				(!stored || props.refreshToken !== stored.refreshToken)
			) {
				this.session = {
					accessToken: props.accessToken,
					refreshToken: props.refreshToken,
					expiresAt: props.expiresAt,
					scopes: props.scopes,
					activeTenantId:
						stored?.activeTenantId ?? props.activeTenantId,
				};
				await this.ctx.storage.put("session", this.session);
			}
		}

		const getClient = () => {
			const s = this.session!;
			return new XeroClient(
				{
					XERO_CLIENT_ID: this.env.XERO_CLIENT_ID,
					XERO_CLIENT_SECRET: this.env.XERO_CLIENT_SECRET,
				},
				{
					accessToken: s.accessToken,
					refreshToken: s.refreshToken,
					expiresAt: s.expiresAt,
					activeTenantId: s.activeTenantId,
					scopes: s.scopes,
				},
				{
					onTokenRefresh: async (update) => {
						this.session = {
							...this.session!,
							accessToken: update.accessToken,
							refreshToken: update.refreshToken,
							expiresAt: update.expiresAt,
							scopes: update.scopes ?? this.session!.scopes,
						};
						await this.ctx.storage.put("session", this.session);
					},
				},
			);
		};

		const getProps = (): Props => ({
			...props,
			accessToken: this.session!.accessToken,
			refreshToken: this.session!.refreshToken,
			expiresAt: this.session!.expiresAt,
			scopes: this.session!.scopes,
			activeTenantId: this.session!.activeTenantId,
		});

		const setActiveTenant = async (tenantId: string) => {
			this.session = {
				...this.session!,
				activeTenantId: tenantId,
			};
			await this.ctx.storage.put("session", this.session);
		};

		registerAllTools(this.server, getClient, getProps, setActiveTenant);
	}
}

export default new OAuthProvider({
	apiHandler: XeroMCP.serve("/mcp"),
	apiRoute: "/mcp",
	authorizeEndpoint: "/authorize",
	clientRegistrationEndpoint: "/register",
	defaultHandler: XeroHandler as any,
	tokenEndpoint: "/token",
});
