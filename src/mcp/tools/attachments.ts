import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const entityEnum = z.enum([
	"Invoices",
	"CreditNotes",
	"BankTransactions",
	"BankTransfers",
	"Contacts",
	"Accounts",
	"ManualJournals",
	"Receipts",
	"PurchaseOrders",
	"Quotes",
]);

export function registerAttachmentTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_attachments",
		"List attachments on a Xero entity. Requires accounting.attachments.read.",
		{
			tenant_id: z.string().uuid().optional(),
			entity: entityEnum.describe("Entity collection name, e.g. Invoices"),
			entity_id: z.string().uuid(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", `/${args.entity}/${args.entity_id}/Attachments`),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"upload_attachment",
		"Upload a base64-encoded attachment to a Xero entity. Requires accounting.attachments. Keep files small.",
		{
			tenant_id: z.string().uuid().optional(),
			entity: entityEnum,
			entity_id: z.string().uuid(),
			file_name: z.string().min(1).describe("File name including extension"),
			content_base64: z.string().describe("Base64 file content"),
			content_type: z.string().default("application/octet-stream"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const binary = Uint8Array.from(atob(args.content_base64), (c) => c.charCodeAt(0));
				if (binary.byteLength > 5_000_000) {
					return toolError(new Error("Attachment exceeds 5MB limit for this MCP tool."));
				}
				const encodedName = encodeURIComponent(args.file_name);
				return toolOk(
					await client.request(
						"PUT",
						`/${args.entity}/${args.entity_id}/Attachments/${encodedName}`,
						{
							rawBody: binary.buffer,
							contentType: args.content_type,
							headers: {
								"Content-Length": String(binary.byteLength),
							},
						},
					),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
