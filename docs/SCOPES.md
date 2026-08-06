# Xero scopes ↔ MCP tools

New Xero apps (on/after **2026-03-02**) must use **granular** scopes. Broad scopes `accounting.transactions` and `accounting.reports.read` are deprecated.

Official reference: [Xero OAuth 2.0 scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/).

## Consent presets

### Read only (`scope_preset=read`)

```
openid profile email offline_access
accounting.contacts.read
accounting.invoices.read
accounting.payments.read
accounting.banktransactions.read
accounting.settings.read
accounting.attachments.read
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.banksummary.read
accounting.reports.executivesummary.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read
accounting.reports.taxreports.read
```

### Read + write (`scope_preset=readwrite`)

```
openid profile email offline_access
accounting.contacts
accounting.invoices
accounting.payments
accounting.banktransactions
accounting.settings
accounting.attachments
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.banksummary.read
accounting.reports.executivesummary.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read
accounting.reports.taxreports.read
```

Write scopes for a resource family imply the corresponding `.read` access for tool gating.

## Tool map

| Tool | Required scope (any of) | Xero API |
|------|-------------------------|----------|
| `xero_whoami` | (session) | token claims + `/connections` |
| `list_organisations` | (session) | `GET /connections` |
| `set_active_organisation` | (session) | validates tenant |
| `list_granted_scopes` | (session) | props |
| `list_contacts` / `get_contact` | `accounting.contacts.read` | `/Contacts` |
| `create_contact` / `update_contact` | `accounting.contacts` | `/Contacts` |
| `list_invoices` / `list_bills` / `get_invoice` | `accounting.invoices.read` | `/Invoices` |
| `create_invoice` / `create_bill` / `update_*` / `email_invoice` | `accounting.invoices` | `/Invoices` |
| `list_credit_notes` / `create_credit_note` / `allocate_credit_note` | invoices family | `/CreditNotes` |
| `list_quotes` / `create_quote` | invoices family | `/Quotes` |
| `list_purchase_orders` / `create_purchase_order` | invoices family | `/PurchaseOrders` |
| `list_repeating_invoices` | `accounting.invoices.read` | `/RepeatingInvoices` |
| `list_items` | invoices.read **or** settings.read | `/Items` |
| `list_payments` / `get_payment` | `accounting.payments.read` | `/Payments` |
| `create_payment` / `delete_payment` / batch / allocate | `accounting.payments` | `/Payments`, `/BatchPayments`, … |
| `list_bank_transactions` / transfers | `accounting.banktransactions.read` | `/BankTransactions`, `/BankTransfers` |
| `create_bank_transaction` / `create_bank_transfer` | `accounting.banktransactions` | same |
| `list_accounts` / tax / tracking / currencies / org | `accounting.settings.read` | `/Accounts`, … |
| `get_profit_and_loss` | `accounting.reports.profitandloss.read` | `/Reports/ProfitAndLoss` |
| `get_balance_sheet` | `accounting.reports.balancesheet.read` | `/Reports/BalanceSheet` |
| `get_trial_balance` | `accounting.reports.trialbalance.read` | `/Reports/TrialBalance` |
| `get_executive_summary` | `accounting.reports.executivesummary.read` | `/Reports/ExecutiveSummary` |
| `get_bank_summary` | `accounting.reports.banksummary.read` | `/Reports/BankSummary` |
| `get_aged_receivables` / `get_aged_payables` | `accounting.reports.aged.read` | Aged* reports |
| `list_attachments` | `accounting.attachments.read` | `/{Entity}/{id}/Attachments` |
| `upload_attachment` | `accounting.attachments` | PUT attachment |

## Out of Phase 1 (not requested)

| Scope / API | Reason |
|-------------|--------|
| `bankfeeds` | Separate Bank Feeds API + certification |
| `accounting.manualjournals` | Deferred |
| Journals `/Journals` | Premium / approval |
| Payroll, Assets, Projects, Files | Later phases |

## Override

Advanced deploys may set secret/env `XERO_SCOPES_OVERRIDE` (space-separated) to replace the preset scope string. Prefer presets for least privilege.
