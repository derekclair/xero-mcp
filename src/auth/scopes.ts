/**
 * Xero granular OAuth scopes (required for apps created on/after 2026-03-02).
 * Broad scopes `accounting.transactions` and `accounting.reports.read` are deprecated.
 *
 * @see https://developer.xero.com/documentation/guides/oauth2/scopes/
 */

/** OpenID + offline for identity and refresh tokens */
export const IDENTITY_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
] as const;

/** Read-only accounting scopes for day-to-day reporting and inspection */
export const READ_SCOPES = [
	"accounting.contacts.read",
	"accounting.invoices.read",
	"accounting.payments.read",
	"accounting.banktransactions.read",
	"accounting.settings.read",
	"accounting.attachments.read",
	"accounting.reports.aged.read",
	"accounting.reports.balancesheet.read",
	"accounting.reports.banksummary.read",
	"accounting.reports.executivesummary.read",
	"accounting.reports.profitandloss.read",
	"accounting.reports.trialbalance.read",
	"accounting.reports.taxreports.read",
] as const;

/**
 * Write scopes (include read capability for the same resource family).
 * Xero write scopes typically supersede `.read` for that family.
 */
export const WRITE_SCOPES = [
	"accounting.contacts",
	"accounting.invoices",
	"accounting.payments",
	"accounting.banktransactions",
	"accounting.settings",
	"accounting.attachments",
] as const;

/** Report scopes are read-only by design */
export const REPORT_SCOPES = [
	"accounting.reports.aged.read",
	"accounting.reports.balancesheet.read",
	"accounting.reports.banksummary.read",
	"accounting.reports.executivesummary.read",
	"accounting.reports.profitandloss.read",
	"accounting.reports.trialbalance.read",
	"accounting.reports.taxreports.read",
] as const;

export type ScopePreset = "read" | "readwrite";

export function scopesForPreset(preset: ScopePreset): string[] {
	if (preset === "read") {
		return [...IDENTITY_SCOPES, ...READ_SCOPES];
	}
	// readwrite: write scopes + report scopes + identity
	return [...IDENTITY_SCOPES, ...WRITE_SCOPES, ...REPORT_SCOPES];
}

export function scopeString(preset: ScopePreset, override?: string): string {
	if (override?.trim()) {
		return override.trim().split(/\s+/).join(" ");
	}
	return scopesForPreset(preset).join(" ");
}

/**
 * Human-readable bullets shown on the consent screen.
 */
export function scopeBullets(preset: ScopePreset): string[] {
	if (preset === "read") {
		return [
			"View contacts (customers and suppliers)",
			"View invoices, bills, credit notes, quotes, and purchase orders",
			"View payments, overpayments, and prepayments",
			"View bank transactions and transfers",
			"View chart of accounts, tax rates, and settings needed to understand books",
			"View financial reports (P&L, balance sheet, trial balance, aged AR/AP, bank summary)",
			"View document attachments",
		];
	}
	return [
		"Create and update contacts",
		"Create and update invoices, bills, credit notes, quotes, and purchase orders",
		"Record and delete payments (cash application)",
		"Create bank transactions and transfers",
		"View and use chart of accounts, tax rates, and tracking categories",
		"View financial reports (P&L, balance sheet, trial balance, aged AR/AP, bank summary)",
		"Upload and view document attachments",
		"Note: writes default to DRAFT where possible; destructive actions require explicit confirmation",
	];
}

/**
 * Tool → required scopes. A tool is registered if the user has ANY listed
 * alternative (e.g. write scope satisfies read tools for that family).
 */
export type ScopeRequirement = {
	/** Any one of these groups must be fully satisfied (OR of ANDs). Usually one scope each. */
	anyOf: string[];
};

/** True if granted scopes include `required` or its write parent (strip .read). */
export function hasScope(granted: Set<string>, required: string): boolean {
	if (granted.has(required)) return true;
	// write scope implies read
	if (required.endsWith(".read")) {
		const write = required.replace(/\.read$/, "");
		if (granted.has(write)) return true;
	}
	// accounting.reports.* are already .read only
	return false;
}

export function hasAnyScope(granted: Set<string>, anyOf: string[]): boolean {
	return anyOf.some((s) => hasScope(granted, s));
}

export function parseGrantedScopes(scopeStringValue: string | undefined | null): Set<string> {
	if (!scopeStringValue) return new Set();
	return new Set(scopeStringValue.split(/\s+/).filter(Boolean));
}

/** Tool catalog for gating */
export const TOOL_SCOPE_MAP: Record<string, ScopeRequirement> = {
	// Always available once authenticated
	xero_whoami: { anyOf: [] },
	list_organisations: { anyOf: [] },
	set_active_organisation: { anyOf: [] },
	list_granted_scopes: { anyOf: [] },

	// Contacts
	list_contacts: { anyOf: ["accounting.contacts.read"] },
	get_contact: { anyOf: ["accounting.contacts.read"] },
	create_contact: { anyOf: ["accounting.contacts"] },
	update_contact: { anyOf: ["accounting.contacts"] },

	// AR / AP (invoices family)
	list_invoices: { anyOf: ["accounting.invoices.read"] },
	get_invoice: { anyOf: ["accounting.invoices.read"] },
	create_invoice: { anyOf: ["accounting.invoices"] },
	update_invoice: { anyOf: ["accounting.invoices"] },
	email_invoice: { anyOf: ["accounting.invoices"] },
	list_bills: { anyOf: ["accounting.invoices.read"] },
	create_bill: { anyOf: ["accounting.invoices"] },
	update_bill: { anyOf: ["accounting.invoices"] },
	list_credit_notes: { anyOf: ["accounting.invoices.read"] },
	create_credit_note: { anyOf: ["accounting.invoices"] },
	allocate_credit_note: { anyOf: ["accounting.invoices"] },
	list_quotes: { anyOf: ["accounting.invoices.read"] },
	create_quote: { anyOf: ["accounting.invoices"] },
	list_purchase_orders: { anyOf: ["accounting.invoices.read"] },
	create_purchase_order: { anyOf: ["accounting.invoices"] },
	list_repeating_invoices: { anyOf: ["accounting.invoices.read"] },
	list_items: { anyOf: ["accounting.invoices.read", "accounting.settings.read"] },

	// Payments
	list_payments: { anyOf: ["accounting.payments.read"] },
	get_payment: { anyOf: ["accounting.payments.read"] },
	create_payment: { anyOf: ["accounting.payments"] },
	delete_payment: { anyOf: ["accounting.payments"] },
	list_batch_payments: { anyOf: ["accounting.payments.read"] },
	create_batch_payment: { anyOf: ["accounting.payments"] },
	list_overpayments: { anyOf: ["accounting.payments.read"] },
	allocate_overpayment: { anyOf: ["accounting.payments"] },
	list_prepayments: { anyOf: ["accounting.payments.read"] },
	allocate_prepayment: { anyOf: ["accounting.payments"] },

	// Banking
	list_bank_transactions: { anyOf: ["accounting.banktransactions.read"] },
	get_bank_transaction: { anyOf: ["accounting.banktransactions.read"] },
	create_bank_transaction: { anyOf: ["accounting.banktransactions"] },
	update_bank_transaction: { anyOf: ["accounting.banktransactions"] },
	list_bank_transfers: { anyOf: ["accounting.banktransactions.read"] },
	create_bank_transfer: { anyOf: ["accounting.banktransactions"] },

	// Settings
	list_accounts: { anyOf: ["accounting.settings.read"] },
	list_tax_rates: { anyOf: ["accounting.settings.read"] },
	list_tracking_categories: { anyOf: ["accounting.settings.read"] },
	list_currencies: { anyOf: ["accounting.settings.read"] },
	get_organisation: { anyOf: ["accounting.settings.read"] },

	// Reports
	get_profit_and_loss: { anyOf: ["accounting.reports.profitandloss.read"] },
	get_balance_sheet: { anyOf: ["accounting.reports.balancesheet.read"] },
	get_trial_balance: { anyOf: ["accounting.reports.trialbalance.read"] },
	get_executive_summary: { anyOf: ["accounting.reports.executivesummary.read"] },
	get_bank_summary: { anyOf: ["accounting.reports.banksummary.read"] },
	get_aged_receivables: { anyOf: ["accounting.reports.aged.read"] },
	get_aged_payables: { anyOf: ["accounting.reports.aged.read"] },

	// Attachments
	list_attachments: { anyOf: ["accounting.attachments.read"] },
	upload_attachment: { anyOf: ["accounting.attachments"] },
};

export function canRegisterTool(toolName: string, granted: Set<string>): boolean {
	const req = TOOL_SCOPE_MAP[toolName];
	if (!req) return false;
	if (req.anyOf.length === 0) return true;
	return hasAnyScope(granted, req.anyOf);
}
