import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import { buildQuery, summariseList } from "../../xero/pagination";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerSettingsTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_accounts",
		"List chart of accounts (including bank accounts). Requires accounting.settings.read. Filter e.g. Type==\"BANK\".",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
			order: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Accounts: unknown[] }>("GET", "/Accounts", {
					query: buildQuery({ where: args.where, order: args.order }),
				});
				return toolOk(summariseList(data.Accounts ?? [], { max: 200 }));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_tax_rates",
		"List tax rates. Requires accounting.settings.read.",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ TaxRates: unknown[] }>("GET", "/TaxRates", {
					query: buildQuery({ where: args.where }),
				});
				return toolOk(summariseList(data.TaxRates ?? [], { max: 100 }));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_tracking_categories",
		"List tracking categories and options. Requires accounting.settings.read.",
		{
			tenant_id: z.string().uuid().optional(),
			include_archived: z.boolean().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ TrackingCategories: unknown[] }>(
					"GET",
					"/TrackingCategories",
					{
						query: buildQuery({ includeArchived: args.include_archived }),
					},
				);
				return toolOk(data.TrackingCategories ?? []);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_currencies",
		"List currencies enabled for the organisation. Requires accounting.settings.read.",
		{
			tenant_id: z.string().uuid().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Currencies: unknown[] }>("GET", "/Currencies");
				return toolOk(data.Currencies ?? []);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_organisation",
		"Get organisation details for the active tenant. Requires accounting.settings.read.",
		{
			tenant_id: z.string().uuid().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(await client.request("GET", "/Organisation"));
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
