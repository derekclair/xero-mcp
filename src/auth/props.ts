/**
 * Session props stored encrypted in the MCP OAuth token and available as this.props.
 * Never log accessToken / refreshToken.
 */

export type XeroConnection = {
	id: string;
	tenantId: string;
	tenantType: string;
	tenantName: string;
	createdDateUtc?: string;
	updatedDateUtc?: string;
};

export type Props = {
	/** Xero user subject / login label */
	login: string;
	name: string;
	email: string;
	/** Xero access token (short-lived ~30m) */
	accessToken: string;
	/** Xero refresh token — rotate on refresh */
	refreshToken: string;
	/** Expiry unix ms */
	expiresAt: number;
	/** Space-separated scopes granted by Xero */
	scopes: string;
	/** Authorised organisations at connect time (may go stale; re-fetch via API) */
	connections: XeroConnection[];
	/** Active tenant for Accounting API calls */
	activeTenantId: string | null;
	/** Consent preset used at connect */
	scopePreset: "read" | "readwrite";
};

export function redactProps(props: Partial<Props>): Record<string, unknown> {
	return {
		login: props.login,
		name: props.name,
		email: props.email,
		scopes: props.scopes,
		activeTenantId: props.activeTenantId,
		scopePreset: props.scopePreset,
		connectionCount: props.connections?.length ?? 0,
		expiresAt: props.expiresAt,
		hasAccessToken: Boolean(props.accessToken),
		hasRefreshToken: Boolean(props.refreshToken),
	};
}
