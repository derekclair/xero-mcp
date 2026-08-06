import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import { buildQuery, summariseList } from "../../xero/pagination";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Banking tools — ledger bank transactions & transfers.
 * NOTE: Full bank-feed statement-line matching is NOT exposed by Xero Accounting API.
 * Bank Feeds API (bankfeeds scope) is out of Phase 1.
 */

const bankLineSchema = z.object({
	description: z.string().optional(),
	quantity: z.number().optional().default(1),
	unit_amount: z.number(),
	account_code: z.string().describe("GL account code for the other side of the bank entry"),
	tax_type: z.string().optional(),
});

export function registerBankTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_bank_transactions",
		"List bank transactions (spend/receive money) in the ledger. Filter e.g. IsReconciled==false. Requires accounting.banktransactions.read. Does not list raw bank-feed statement lines.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z
				.string()
				.optional()
				.describe('Xero where clause, e.g. Type=="SPEND" or IsReconciled==false'),
			order: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ BankTransactions: unknown[] }>(
					"GET",
					"/BankTransactions",
					{
						query: buildQuery({
							page: args.page,
							where: args.where,
							order: args.order,
						}),
					},
				);
				return toolOk({
					...summariseList(data.BankTransactions ?? []),
					limitation:
						"These are ledger bank transactions, not bank-feed statement lines. Full recon matching is done in Xero UI or via certified Bank Feeds API.",
				});
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_bank_transaction",
		"Get a bank transaction by BankTransactionID (includes IsReconciled).",
		{
			tenant_id: z.string().uuid().optional(),
			bank_transaction_id: z.string().uuid(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", `/BankTransactions/${args.bank_transaction_id}`),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_bank_transaction",
		"Create a spend or receive money bank transaction. Requires accounting.banktransactions. IsReconciled is for conversion-style use cases — prefer normal recon in Xero when feeds exist.",
		{
			tenant_id: z.string().uuid().optional(),
			type: z.enum(["SPEND", "RECEIVE"]),
			bank_account_id: z.string().uuid().describe("Bank AccountID"),
			contact_id: z.string().uuid().optional(),
			line_items: z.array(bankLineSchema).min(1),
			date: z.string().optional().describe("YYYY-MM-DD"),
			reference: z.string().optional(),
			status: z.enum(["AUTHORISED", "DELETED"]).default("AUTHORISED"),
			is_reconciled: z.boolean().optional(),
			line_amount_types: z.enum(["Exclusive", "Inclusive", "NoTax"]).optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const tx: Record<string, unknown> = {
					Type: args.type,
					BankAccount: { AccountID: args.bank_account_id },
					LineItems: args.line_items.map((li) => ({
						Description: li.description,
						Quantity: li.quantity ?? 1,
						UnitAmount: li.unit_amount,
						AccountCode: li.account_code,
						TaxType: li.tax_type,
					})),
					Status: args.status ?? "AUTHORISED",
				};
				if (args.contact_id) tx.Contact = { ContactID: args.contact_id };
				if (args.date) tx.Date = args.date;
				if (args.reference) tx.Reference = args.reference;
				if (args.is_reconciled != null) tx.IsReconciled = args.is_reconciled;
				if (args.line_amount_types) tx.LineAmountTypes = args.line_amount_types;
				return toolOk(
					await client.request("PUT", "/BankTransactions", {
						body: { BankTransactions: [tx] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"update_bank_transaction",
		"Update a bank transaction (limited once reconciled). Requires accounting.banktransactions.",
		{
			tenant_id: z.string().uuid().optional(),
			bank_transaction_id: z.string().uuid(),
			reference: z.string().optional(),
			status: z.enum(["AUTHORISED", "DELETED"]).optional(),
			confirm: z
				.boolean()
				.optional()
				.describe("Required true when status is DELETED"),
		},
		async (args) => {
			try {
				if (args.status === "DELETED" && args.confirm !== true) {
					return toolError(new Error("Refusing DELETED without confirm:true."));
				}
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const tx: Record<string, unknown> = {
					BankTransactionID: args.bank_transaction_id,
				};
				if (args.reference) tx.Reference = args.reference;
				if (args.status) tx.Status = args.status;
				return toolOk(
					await client.request(
						"POST",
						`/BankTransactions/${args.bank_transaction_id}`,
						{ body: { BankTransactions: [tx] } },
					),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_bank_transfers",
		"List transfers between bank accounts. Requires accounting.banktransactions.read.",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ BankTransfers: unknown[] }>(
					"GET",
					"/BankTransfers",
					{ query: buildQuery({ where: args.where }) },
				);
				return toolOk(summariseList(data.BankTransfers ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_bank_transfer",
		"Create a transfer between two bank accounts. Requires accounting.banktransactions.",
		{
			tenant_id: z.string().uuid().optional(),
			from_bank_account_id: z.string().uuid(),
			to_bank_account_id: z.string().uuid(),
			amount: z.number().positive(),
			date: z.string().optional().describe("YYYY-MM-DD"),
			reference: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const transfer: Record<string, unknown> = {
					FromBankAccount: { AccountID: args.from_bank_account_id },
					ToBankAccount: { AccountID: args.to_bank_account_id },
					Amount: args.amount,
				};
				if (args.date) transfer.Date = args.date;
				if (args.reference) transfer.Reference = args.reference;
				return toolOk(
					await client.request("PUT", "/BankTransfers", {
						body: { BankTransfers: [transfer] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
