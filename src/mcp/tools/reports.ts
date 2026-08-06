import { z } from "zod";
import type { XeroClient } from "../../xero/client";
import { resolveTenant } from "../../xero/client";
import { toolError, toolOk } from "../../xero/errors";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const dateOpts = {
	tenant_id: z.string().uuid().optional(),
	from_date: z.string().optional().describe("YYYY-MM-DD"),
	to_date: z.string().optional().describe("YYYY-MM-DD"),
	date: z.string().optional().describe("As-at date YYYY-MM-DD"),
	periods: z.number().int().optional(),
	timeframe: z.string().optional().describe("e.g. MONTH, QUARTER, YEAR"),
	tracking_category_id: z.string().uuid().optional(),
	tracking_category_id2: z.string().uuid().optional(),
	payments_only: z.boolean().optional(),
	standard_layout: z.boolean().optional(),
};

function reportQuery(args: {
	from_date?: string;
	to_date?: string;
	date?: string;
	periods?: number;
	timeframe?: string;
	tracking_category_id?: string;
	tracking_category_id2?: string;
	payments_only?: boolean;
	standard_layout?: boolean;
	[key: string]: unknown;
}): Record<string, string | number | boolean | undefined> {
	return {
		fromDate: args.from_date,
		toDate: args.to_date,
		date: args.date,
		periods: args.periods,
		timeframe: args.timeframe,
		trackingCategoryID: args.tracking_category_id,
		trackingCategoryID2: args.tracking_category_id2,
		paymentsOnly: args.payments_only,
		standardLayout: args.standard_layout,
	};
}

export function registerReportTools(server: McpServer, getClient: () => XeroClient) {
	server.tool(
		"get_profit_and_loss",
		"Profit and Loss report. Requires accounting.reports.profitandloss.read.",
		dateOpts,
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/ProfitAndLoss", {
						query: reportQuery(args),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_balance_sheet",
		"Balance Sheet report. Requires accounting.reports.balancesheet.read.",
		{
			tenant_id: z.string().uuid().optional(),
			date: z.string().optional().describe("As-at YYYY-MM-DD"),
			periods: z.number().int().optional(),
			timeframe: z.string().optional(),
			tracking_category_id: z.string().uuid().optional(),
			tracking_category_id2: z.string().uuid().optional(),
			standard_layout: z.boolean().optional(),
			payments_only: z.boolean().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/BalanceSheet", {
						query: reportQuery(args),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_trial_balance",
		"Trial Balance report. Requires accounting.reports.trialbalance.read.",
		{
			tenant_id: z.string().uuid().optional(),
			date: z.string().optional(),
			payments_only: z.boolean().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/TrialBalance", {
						query: reportQuery(args),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_executive_summary",
		"Executive Summary report. Requires accounting.reports.executivesummary.read.",
		{
			tenant_id: z.string().uuid().optional(),
			date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/ExecutiveSummary", {
						query: reportQuery(args),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_bank_summary",
		"Bank Summary report (balances/activity). Requires accounting.reports.banksummary.read.",
		{
			tenant_id: z.string().uuid().optional(),
			from_date: z.string().optional(),
			to_date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/BankSummary", {
						query: reportQuery(args),
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_aged_receivables",
		"Aged Receivables by Contact. Requires accounting.reports.aged.read.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid().optional().describe("Filter to one contact"),
			date: z.string().optional(),
			from_date: z.string().optional(),
			to_date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/AgedReceivablesByContact", {
						query: {
							...reportQuery(args),
							contactID: args.contact_id,
						},
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);

	server.tool(
		"get_aged_payables",
		"Aged Payables by Contact. Requires accounting.reports.aged.read.",
		{
			tenant_id: z.string().uuid().optional(),
			contact_id: z.string().uuid().optional(),
			date: z.string().optional(),
			from_date: z.string().optional(),
			to_date: z.string().optional(),
		},
		async (args) => {
			try {
				const client = getClient();
				client.setActiveTenantId(await resolveTenant(client, args.tenant_id));
				return toolOk(
					await client.request("GET", "/Reports/AgedPayablesByContact", {
						query: {
							...reportQuery(args),
							contactID: args.contact_id,
						},
					}),
				);
			} catch (e) {
				return toolError(e);
			}
		},
	);
}
