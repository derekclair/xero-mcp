import { z } from "zod";
import type { Props } from "../../auth/props";
import { parseGrantedScopes } from "../../auth/scopes";
import type { XeroClient } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerOrgTools(
	server: McpServer,
	getClient: () => XeroClient,
	getProps: () => Props,
	setActiveTenant: (tenantId: string) => void | Promise<void>,
) {
	server.tool(
		"xero_whoami",
		"Return the authenticated Xero user identity, granted scopes, active organisation, and connection summary. Does not return tokens.",
		{},
		async () => {
			try {
				const props = getProps();
				const client = getClient();
				const connections = await client.listConnections();
				return toolOk({
					login: props.login,
					name: props.name,
					email: props.email,
					scope_preset: props.scopePreset,
					scopes: props.scopes.split(/\s+/).filter(Boolean),
					active_tenant_id: client.getActiveTenantId() ?? props.activeTenantId,
					organisations: connections.map((c) => ({
						tenant_id: c.tenantId,
						name: c.tenantName,
						type: c.tenantType,
					})),
					token_expires_at: new Date(props.expiresAt).toISOString(),
				});
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_organisations",
		"List Xero organisations (tenants) the user has authorised for this app. Use tenant_id with set_active_organisation before accounting tools.",
		{},
		async () => {
			try {
				const connections = await getClient().listConnections();
				return toolOk({
					organisations: connections.map((c) => ({
						connection_id: c.id,
						tenant_id: c.tenantId,
						name: c.tenantName,
						type: c.tenantType,
						created: c.createdDateUtc,
						updated: c.updatedDateUtc,
					})),
					active_tenant_id: getClient().getActiveTenantId(),
				});
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"set_active_organisation",
		"Set the active Xero organisation (tenant) for subsequent Accounting API tools. Tenant must be in list_organisations.",
		{
			tenant_id: z.string().uuid().describe("Xero tenant ID from list_organisations"),
		},
		async ({ tenant_id }) => {
			try {
				const client = getClient();
				const conn = await client.assertTenantAllowed(tenant_id);
				client.setActiveTenantId(tenant_id);
				await setActiveTenant(tenant_id);
				return toolOk({
					ok: true,
					active_tenant_id: tenant_id,
					name: conn.tenantName,
					type: conn.tenantType,
				});
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_granted_scopes",
		"List OAuth scopes granted by the user for this session. Useful to know which tools are available.",
		{},
		async () => {
			try {
				const props = getProps();
				const granted = [...parseGrantedScopes(props.scopes)].sort();
				return toolOk({ scopes: granted, preset: props.scopePreset });
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
