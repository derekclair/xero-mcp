import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import { buildQuery, summariseList } from "../../xero/pagination";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerContactTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"list_contacts",
		"List Xero contacts (customers/suppliers). Supports where filters and paging. Requires accounting.contacts.read.",
		{
			tenant_id: z.string().uuid().optional(),
			page: z.number().int().min(1).optional().describe("Page number (1-based)"),
			where: z
				.string()
				.optional()
				.describe('Xero where clause, e.g. Name.Contains("Acme") or ContactStatus=="ACTIVE"'),
			order: z.string().optional().describe('e.g. "Name ASC"'),
			include_archived: z.boolean().optional(),
			search_term: z
				.string()
				.optional()
				.describe("If set, applies where Name.Contains(...) when where is omitted"),
		},
		async (args) => {
			try {
				const client = getClient();
				const tenant = await resolveTenant(client, args.tenant_id);
				client.setActiveTenantId(tenant);
				let where = args.where;
				if (!where && args.search_term) {
					const safe = args.search_term.replace(/"/g, "");
					where = `Name.Contains("${safe}")`;
				}
				const data = await client.request<{ Contacts: unknown[] }>("GET", "/Contacts", {
					query: buildQuery({
						page: args.page,
						where,
						order: args.order,
						includeArchived: args.include_archived,
					}),
				});
				const list = data.Contacts ?? [];
				return toolOk(summariseList(list));
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_contact",
		"Get a single Xero contact by ContactID.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid().describe("Xero ContactID"),
		},
		async (args) => {
			try {
				const client = getClient();
				const tenant = await resolveTenant(client, args.tenant_id);
				client.setActiveTenantId(tenant);
				const data = await client.request("GET", `/Contacts/${args.contact_id}`);
				return toolOk(data);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"create_contact",
		"Create a Xero contact. Requires accounting.contacts (write).",
		{
			tenant_id: z.string().uuid().optional(),
			name: z.string().min(1).describe("Contact name (required)"),
			email: z.string().email().optional(),
			first_name: z.string().optional(),
			last_name: z.string().optional(),
			is_customer: z.boolean().optional(),
			is_supplier: z.boolean().optional(),
			account_number: z.string().optional(),
			tax_number: z.string().optional(),
			phones: z
				.array(
					z.object({
						phone_type: z.enum(["DEFAULT", "DDI", "MOBILE", "FAX", "OFFICE"]).optional(),
						phone_number: z.string(),
					}),
				)
				.optional(),
			addresses: z
				.array(
					z.object({
						address_type: z.enum(["POBOX", "STREET", "DELIVERY"]).optional(),
						address_line1: z.string().optional(),
						city: z.string().optional(),
						region: z.string().optional(),
						postal_code: z.string().optional(),
						country: z.string().optional(),
					}),
				)
				.optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				const tenant = await resolveTenant(client, args.tenant_id);
				client.setActiveTenantId(tenant);
				const contact: Record<string, unknown> = {
					Name: args.name,
				};
				if (args.email) contact.EmailAddress = args.email;
				if (args.first_name) contact.FirstName = args.first_name;
				if (args.last_name) contact.LastName = args.last_name;
				if (args.is_customer != null) contact.IsCustomer = args.is_customer;
				if (args.is_supplier != null) contact.IsSupplier = args.is_supplier;
				if (args.account_number) contact.AccountNumber = args.account_number;
				if (args.tax_number) contact.TaxNumber = args.tax_number;
				if (args.phones) {
					contact.Phones = args.phones.map((p) => ({
						PhoneType: p.phone_type ?? "DEFAULT",
						PhoneNumber: p.phone_number,
					}));
				}
				if (args.addresses) {
					contact.Addresses = args.addresses.map((a) => ({
						AddressType: a.address_type ?? "STREET",
						AddressLine1: a.address_line1,
						City: a.city,
						Region: a.region,
						PostalCode: a.postal_code,
						Country: a.country,
					}));
				}
				const data = await client.request("POST", "/Contacts", {
					body: { Contacts: [contact] },
					idempotencyKey: crypto.randomUUID(),
				});
				return toolOk(data);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"update_contact",
		"Update an existing Xero contact. Requires accounting.contacts (write).",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid(),
			name: z.string().optional(),
			email: z.string().email().optional(),
			first_name: z.string().optional(),
			last_name: z.string().optional(),
			contact_status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				const tenant = await resolveTenant(client, args.tenant_id);
				client.setActiveTenantId(tenant);
				const contact: Record<string, unknown> = {
					ContactID: args.contact_id,
				};
				if (args.name) contact.Name = args.name;
				if (args.email) contact.EmailAddress = args.email;
				if (args.first_name) contact.FirstName = args.first_name;
				if (args.last_name) contact.LastName = args.last_name;
				if (args.contact_status) contact.ContactStatus = args.contact_status;
				const data = await client.request("POST", `/Contacts/${args.contact_id}`, {
					body: { Contacts: [contact] },
				});
				return toolOk(data);
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
