import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import { buildQuery, summariseList } from "../../xero/pagination";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPaymentTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_payments",
		"List payments applied to invoices/bills. Requires accounting.payments.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Payments: unknown[] }>("GET", "/Payments", {
					query: buildQuery({ page: args.page, where: args.where }),
				});
				return toolOk(summariseList(data.Payments ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_payment",
		"Get a single payment by PaymentID.",
		{
			tenant_id: z.string().uuid().optional(),
			payment_id: z.string().uuid(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(await client.request("GET", `/Payments/${args.payment_id}`));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_payment",
		"Apply a payment to an invoice or bill (cash application). Requires accounting.payments. Money-moving — amounts must be explicit.",
		{
			tenant_id: z.string().uuid().optional(),
			invoice_id: z.string().uuid().describe("Invoice or bill InvoiceID"),
			account_id: z
				.string()
				.uuid()
				.describe("Bank account AccountID (from list_accounts where Type==BANK)"),
			amount: z.number().positive().describe("Payment amount"),
			date: z.string().optional().describe("YYYY-MM-DD"),
			reference: z.string().optional(),
			currency_rate: z.number().optional(),
			is_reconciled: z
				.boolean()
				.optional()
				.describe("Conversion-style flag; use carefully"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const payment: Record<string, unknown> = {
					Invoice: { InvoiceID: args.invoice_id },
					Account: { AccountID: args.account_id },
					Amount: args.amount,
				};
				if (args.date) payment.Date = args.date;
				if (args.reference) payment.Reference = args.reference;
				if (args.currency_rate != null) payment.CurrencyRate = args.currency_rate;
				if (args.is_reconciled != null) payment.IsReconciled = args.is_reconciled;
				return toolOk(
					await client.request("PUT", "/Payments", {
						body: { Payments: [payment] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"delete_payment",
		"Delete (soft-delete) a payment. Requires confirm:true. Requires accounting.payments.",
		{
			tenant_id: z.string().uuid().optional(),
			payment_id: z.string().uuid(),
			confirm: z.literal(true).describe("Must be true to proceed"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("POST", `/Payments/${args.payment_id}`, {
						body: { Status: "DELETED" },
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_batch_payments",
		"List batch payments. Requires accounting.payments.read.",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ BatchPayments: unknown[] }>(
					"GET",
					"/BatchPayments",
					{ query: buildQuery({ where: args.where }) },
				);
				return toolOk(summariseList(data.BatchPayments ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_batch_payment",
		"Create a batch payment (multiple invoices, one bank withdrawal). Requires accounting.payments.",
		{
			tenant_id: z.string().uuid().optional(),
			account_id: z.string().uuid().describe("Bank AccountID"),
			date: z.string().describe("YYYY-MM-DD"),
			reference: z.string().optional(),
			payments: z
				.array(
					z.object({
						invoice_id: z.string().uuid(),
						amount: z.number().positive(),
					}),
				)
				.min(1),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const batch: Record<string, unknown> = {
					Account: { AccountID: args.account_id },
					Date: args.date,
					Payments: args.payments.map((p) => ({
						Invoice: { InvoiceID: p.invoice_id },
						Amount: p.amount,
					})),
				};
				if (args.reference) batch.Reference = args.reference;
				return toolOk(
					await client.request("PUT", "/BatchPayments", {
						body: { BatchPayments: [batch] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_overpayments",
		"List overpayments. Requires accounting.payments.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Overpayments: unknown[] }>(
					"GET",
					"/Overpayments",
					{ query: buildQuery({ page: args.page, where: args.where }) },
				);
				return toolOk(summariseList(data.Overpayments ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"allocate_overpayment",
		"Allocate an overpayment to an invoice. Requires accounting.payments.",
		{
			tenant_id: z.string().uuid().optional(),
			overpayment_id: z.string().uuid(),
			invoice_id: z.string().uuid(),
			amount: z.number().positive(),
			date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const allocation: Record<string, unknown> = {
					Invoice: { InvoiceID: args.invoice_id },
					Amount: args.amount,
				};
				if (args.date) allocation.Date = args.date;
				return toolOk(
					await client.request(
						"PUT",
						`/Overpayments/${args.overpayment_id}/Allocations`,
						{
							body: { Allocations: [allocation] },
							idempotencyKey: crypto.randomUUID(),
						},
					),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_prepayments",
		"List prepayments. Requires accounting.payments.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Prepayments: unknown[] }>(
					"GET",
					"/Prepayments",
					{ query: buildQuery({ page: args.page, where: args.where }) },
				);
				return toolOk(summariseList(data.Prepayments ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"allocate_prepayment",
		"Allocate a prepayment to an invoice. Requires accounting.payments.",
		{
			tenant_id: z.string().uuid().optional(),
			prepayment_id: z.string().uuid(),
			invoice_id: z.string().uuid(),
			amount: z.number().positive(),
			date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const allocation: Record<string, unknown> = {
					Invoice: { InvoiceID: args.invoice_id },
					Amount: args.amount,
				};
				if (args.date) allocation.Date = args.date;
				return toolOk(
					await client.request(
						"PUT",
						`/Prepayments/${args.prepayment_id}/Allocations`,
						{
							body: { Allocations: [allocation] },
							idempotencyKey: crypto.randomUUID(),
						},
					),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
