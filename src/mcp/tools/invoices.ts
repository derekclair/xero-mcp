import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import { buildQuery, summariseList } from "../../xero/pagination";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const lineItemSchema = z.object({
	description: z.string().optional(),
	quantity: z.number().optional(),
	unit_amount: z.number().optional(),
	account_code: z.string().optional().describe("Chart of accounts code"),
	item_code: z.string().optional(),
	tax_type: z.string().optional(),
	line_amount: z.number().optional(),
});

function mapLineItems(items: z.infer<typeof lineItemSchema>[]) {
	return items.map((li) => ({
		Description: li.description,
		Quantity: li.quantity,
		UnitAmount: li.unit_amount,
		AccountCode: li.account_code,
		ItemCode: li.item_code,
		TaxType: li.tax_type,
		LineAmount: li.line_amount,
	}));
}

export function registerInvoiceTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_invoices",
		'List ACCREC (sales) invoices. Filter with where, e.g. Status=="AUTHORISED". Requires accounting.invoices.read.',
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
			statuses: z
				.string()
				.optional()
				.describe("Comma-separated statuses: DRAFT,SUBMITTED,AUTHORISED,PAID,VOIDED"),
			contact_id: z.string().uuid().optional(),
			invoice_numbers: z.string().optional().describe("Comma-separated invoice numbers"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const clauses = ['Type=="ACCREC"'];
				if (args.where) clauses.push(`(${args.where})`);
				if (args.contact_id) clauses.push(`Contact.ContactID=Guid("${args.contact_id}")`);
				const data = await client.request<{ Invoices: unknown[] }>("GET", "/Invoices", {
					query: {
						...buildQuery({ page: args.page, where: clauses.join("&&") }),
						...(args.statuses ? { Statuses: args.statuses } : {}),
						...(args.invoice_numbers ? { InvoiceNumbers: args.invoice_numbers } : {}),
					},
				});
				return toolOk(summariseList(data.Invoices ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_bills",
		'List ACCPAY (bills/payables) invoices. Requires accounting.invoices.read.',
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
			statuses: z.string().optional(),
			contact_id: z.string().uuid().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const clauses = ['Type=="ACCPAY"'];
				if (args.where) clauses.push(`(${args.where})`);
				if (args.contact_id) clauses.push(`Contact.ContactID=Guid("${args.contact_id}")`);
				const data = await client.request<{ Invoices: unknown[] }>("GET", "/Invoices", {
					query: {
						...buildQuery({ page: args.page, where: clauses.join("&&") }),
						...(args.statuses ? { Statuses: args.statuses } : {}),
					},
				});
				return toolOk(summariseList(data.Invoices ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_invoice",
		"Get a single invoice or bill by InvoiceID (works for ACCREC and ACCPAY).",
		{
			tenant_id: z.string().uuid().optional(),
			invoice_id: z.string().uuid(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(await client.request("GET", `/Invoices/${args.invoice_id}`));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_invoice",
		"Create a sales invoice (ACCREC). Defaults to DRAFT status for safety. Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid().describe("Customer ContactID"),
			line_items: z.array(lineItemSchema).min(1),
			date: z.string().optional().describe("YYYY-MM-DD"),
			due_date: z.string().optional().describe("YYYY-MM-DD"),
			reference: z.string().optional(),
			status: z
				.enum(["DRAFT", "SUBMITTED", "AUTHORISED"])
				.default("DRAFT")
				.describe("Defaults to DRAFT. Use AUTHORISED only when intentional."),
			currency_code: z.string().optional(),
			line_amount_types: z.enum(["Exclusive", "Inclusive", "NoTax"]).optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const invoice: Record<string, unknown> = {
					Type: "ACCREC",
					Contact: { ContactID: args.contact_id },
					LineItems: mapLineItems(args.line_items),
					Status: args.status ?? "DRAFT",
				};
				if (args.date) invoice.Date = args.date;
				if (args.due_date) invoice.DueDate = args.due_date;
				if (args.reference) invoice.Reference = args.reference;
				if (args.currency_code) invoice.CurrencyCode = args.currency_code;
				if (args.line_amount_types) invoice.LineAmountTypes = args.line_amount_types;
				return toolOk(
					await client.request("POST", "/Invoices", {
						body: { Invoices: [invoice] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_bill",
		"Create a bill/payable (ACCPAY). Defaults to DRAFT. Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid().describe("Supplier ContactID"),
			line_items: z.array(lineItemSchema).min(1),
			date: z.string().optional(),
			due_date: z.string().optional(),
			reference: z.string().optional(),
			invoice_number: z.string().optional().describe("Supplier invoice number"),
			status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).default("DRAFT"),
			currency_code: z.string().optional(),
			line_amount_types: z.enum(["Exclusive", "Inclusive", "NoTax"]).optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const invoice: Record<string, unknown> = {
					Type: "ACCPAY",
					Contact: { ContactID: args.contact_id },
					LineItems: mapLineItems(args.line_items),
					Status: args.status ?? "DRAFT",
				};
				if (args.date) invoice.Date = args.date;
				if (args.due_date) invoice.DueDate = args.due_date;
				if (args.reference) invoice.Reference = args.reference;
				if (args.invoice_number) invoice.InvoiceNumber = args.invoice_number;
				if (args.currency_code) invoice.CurrencyCode = args.currency_code;
				if (args.line_amount_types) invoice.LineAmountTypes = args.line_amount_types;
				return toolOk(
					await client.request("POST", "/Invoices", {
						body: { Invoices: [invoice] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"update_invoice",
		"Update an existing invoice/bill. Requires accounting.invoices. Status changes (e.g. VOIDED) need care.",
		{
			tenant_id: z.string().uuid().optional(),
			invoice_id: z.string().uuid(),
			status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "VOIDED", "DELETED"]).optional(),
			reference: z.string().optional(),
			due_date: z.string().optional(),
			line_items: z.array(lineItemSchema).optional(),
			confirm: z
				.boolean()
				.optional()
				.describe("Must be true when status is VOIDED or DELETED"),
		},
		async (args) => {
			try {
				if (
					(args.status === "VOIDED" || args.status === "DELETED") &&
					args.confirm !== true
				) {
					return toolError(
						new Error(
							"Refusing VOIDED/DELETED without confirm:true. This is a destructive status change.",
						),
					);
				}
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const invoice: Record<string, unknown> = { InvoiceID: args.invoice_id };
				if (args.status) invoice.Status = args.status;
				if (args.reference) invoice.Reference = args.reference;
				if (args.due_date) invoice.DueDate = args.due_date;
				if (args.line_items) invoice.LineItems = mapLineItems(args.line_items);
				return toolOk(
					await client.request("POST", `/Invoices/${args.invoice_id}`, {
						body: { Invoices: [invoice] },
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	// Alias for bills with clearer name
	server.tool(
		"update_bill",
		"Update an ACCPAY bill (same endpoint as update_invoice). Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			invoice_id: z.string().uuid().describe("Bill InvoiceID"),
			status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "VOIDED", "DELETED"]).optional(),
			reference: z.string().optional(),
			due_date: z.string().optional(),
			line_items: z.array(lineItemSchema).optional(),
			confirm: z.boolean().optional(),
		},
		async (args) => {
			try {
				if (
					(args.status === "VOIDED" || args.status === "DELETED") &&
					args.confirm !== true
				) {
					return toolError(
						new Error("Refusing VOIDED/DELETED without confirm:true."),
					);
				}
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const invoice: Record<string, unknown> = { InvoiceID: args.invoice_id };
				if (args.status) invoice.Status = args.status;
				if (args.reference) invoice.Reference = args.reference;
				if (args.due_date) invoice.DueDate = args.due_date;
				if (args.line_items) invoice.LineItems = mapLineItems(args.line_items);
				return toolOk(
					await client.request("POST", `/Invoices/${args.invoice_id}`, {
						body: { Invoices: [invoice] },
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"email_invoice",
		"Email an ACCREC invoice to the contact via Xero. Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			invoice_id: z.string().uuid(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				await client.request("POST", `/Invoices/${args.invoice_id}/Email`, {
					body: {},
				});
				return toolOk({ ok: true, invoice_id: args.invoice_id, emailed: true });
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_credit_notes",
		"List credit notes (ACCRECCREDIT / ACCPAYCREDIT). Optional type filter.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
			type: z.enum(["ACCRECCREDIT", "ACCPAYCREDIT"]).optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const clauses: string[] = [];
				if (args.type) clauses.push(`Type=="${args.type}"`);
				if (args.where) clauses.push(`(${args.where})`);
				const data = await client.request<{ CreditNotes: unknown[] }>("GET", "/CreditNotes", {
					query: buildQuery({
						page: args.page,
						where: clauses.length ? clauses.join("&&") : undefined,
					}),
				});
				return toolOk(summariseList(data.CreditNotes ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_credit_note",
		"Create a credit note. Defaults to DRAFT. Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			type: z.enum(["ACCRECCREDIT", "ACCPAYCREDIT"]),
			contact_id: z.string().uuid(),
			line_items: z.array(lineItemSchema).min(1),
			date: z.string().optional(),
			status: z.enum(["DRAFT", "SUBMITTED", "AUTHORISED"]).default("DRAFT"),
			reference: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const cn: Record<string, unknown> = {
					Type: args.type,
					Contact: { ContactID: args.contact_id },
					LineItems: mapLineItems(args.line_items),
					Status: args.status ?? "DRAFT",
				};
				if (args.date) cn.Date = args.date;
				if (args.reference) cn.Reference = args.reference;
				return toolOk(
					await client.request("POST", "/CreditNotes", {
						body: { CreditNotes: [cn] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"allocate_credit_note",
		"Allocate a credit note to an invoice. Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			credit_note_id: z.string().uuid(),
			invoice_id: z.string().uuid(),
			amount: z.number().positive(),
			date: z.string().optional().describe("YYYY-MM-DD"),
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
					await client.request("PUT", `/CreditNotes/${args.credit_note_id}/Allocations`, {
						body: { Allocations: [allocation] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_quotes",
		"List quotes. Requires accounting.invoices.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Quotes: unknown[] }>("GET", "/Quotes", {
					query: buildQuery({ page: args.page, where: args.where }),
				});
				return toolOk(summariseList(data.Quotes ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_quote",
		"Create a quote (DRAFT by default). Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid(),
			line_items: z.array(lineItemSchema).min(1),
			date: z.string().optional(),
			expiry_date: z.string().optional(),
			title: z.string().optional(),
			summary: z.string().optional(),
			status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "INVOICED"]).default("DRAFT"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const quote: Record<string, unknown> = {
					Contact: { ContactID: args.contact_id },
					LineItems: mapLineItems(args.line_items),
					Status: args.status ?? "DRAFT",
				};
				if (args.date) quote.Date = args.date;
				if (args.expiry_date) quote.ExpiryDate = args.expiry_date;
				if (args.title) quote.Title = args.title;
				if (args.summary) quote.Summary = args.summary;
				return toolOk(
					await client.request("POST", "/Quotes", {
						body: { Quotes: [quote] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_purchase_orders",
		"List purchase orders. Requires accounting.invoices.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional(),
			where: z.string().optional(),
			status: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ PurchaseOrders: unknown[] }>(
					"GET",
					"/PurchaseOrders",
					{
						query: {
							...buildQuery({ page: args.page, where: args.where }),
							...(args.status ? { Status: args.status } : {}),
						},
					},
				);
				return toolOk(summariseList(data.PurchaseOrders ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_purchase_order",
		"Create a purchase order (DRAFT by default). Requires accounting.invoices.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid(),
			line_items: z.array(lineItemSchema).min(1),
			date: z.string().optional(),
			delivery_date: z.string().optional(),
			reference: z.string().optional(),
			status: z
				.enum(["DRAFT", "SUBMITTED", "AUTHORISED", "BILLED", "DELETED"])
				.default("DRAFT"),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const po: Record<string, unknown> = {
					Contact: { ContactID: args.contact_id },
					LineItems: mapLineItems(args.line_items),
					Status: args.status ?? "DRAFT",
				};
				if (args.date) po.Date = args.date;
				if (args.delivery_date) po.DeliveryDate = args.delivery_date;
				if (args.reference) po.Reference = args.reference;
				return toolOk(
					await client.request("POST", "/PurchaseOrders", {
						body: { PurchaseOrders: [po] },
						idempotencyKey: crypto.randomUUID(),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_repeating_invoices",
		"List repeating invoice templates. Requires accounting.invoices.read.",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ RepeatingInvoices: unknown[] }>(
					"GET",
					"/RepeatingInvoices",
					{ query: buildQuery({ where: args.where }) },
				);
				return toolOk(summariseList(data.RepeatingInvoices ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"list_items",
		"List inventory/service items. Requires accounting.invoices.read or accounting.settings.read.",
		{
			tenant_id: z.string().uuid().optional(),
			where: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				const data = await client.request<{ Items: unknown[] }>("GET", "/Items", {
					query: buildQuery({ where: args.where }),
				});
				return toolOk(summariseList(data.Items ?? []));
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
