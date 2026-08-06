import { describe, expect, it } from "vitest";
import {
	canRegisterTool,
	hasScope,
	parseGrantedScopes,
	scopesForPreset,
} from "./scopes";

describe("scopes", () => {
	it("read preset is least-privilege (no write scopes)", () => {
		const scopes = scopesForPreset("read");
		expect(scopes).toContain("accounting.invoices.read");
		expect(scopes).not.toContain("accounting.invoices");
		expect(scopes).toContain("offline_access");
	});

	it("readwrite includes write scopes and reports", () => {
		const scopes = scopesForPreset("readwrite");
		expect(scopes).toContain("accounting.invoices");
		expect(scopes).toContain("accounting.payments");
		expect(scopes).toContain("accounting.reports.profitandloss.read");
	});

	it("write scope satisfies .read requirement", () => {
		const granted = parseGrantedScopes("accounting.invoices offline_access");
		expect(hasScope(granted, "accounting.invoices.read")).toBe(true);
		expect(hasScope(granted, "accounting.invoices")).toBe(true);
		expect(hasScope(granted, "accounting.payments")).toBe(false);
	});

	it("gates tools by scope map", () => {
		const readOnly = parseGrantedScopes(
			scopesForPreset("read").join(" "),
		);
		expect(canRegisterTool("list_invoices", readOnly)).toBe(true);
		expect(canRegisterTool("create_invoice", readOnly)).toBe(false);
		expect(canRegisterTool("xero_whoami", readOnly)).toBe(true);
		expect(canRegisterTool("get_profit_and_loss", readOnly)).toBe(true);

		const rw = parseGrantedScopes(scopesForPreset("readwrite").join(" "));
		expect(canRegisterTool("create_invoice", rw)).toBe(true);
		expect(canRegisterTool("create_payment", rw)).toBe(true);
	});
});
