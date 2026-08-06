# MCP tool catalog (Phase 1)

All tools return JSON text. Errors include `code`, optional `required_scope`, and Xero validation details when present.

## Session

| Tool | Description |
|------|-------------|
| `xero_whoami` | User, scopes, orgs (no tokens) |
| `list_organisations` | Authorised tenants |
| `set_active_organisation` | Set active `tenant_id` |
| `list_granted_scopes` | Scope list for this session |

## Contacts

| Tool | R/W |
|------|-----|
| `list_contacts`, `get_contact` | R |
| `create_contact`, `update_contact` | W |

## Receivables / payables

| Tool | R/W | Notes |
|------|-----|-------|
| `list_invoices` | R | ACCREC |
| `list_bills` | R | ACCPAY |
| `get_invoice` | R | Either type |
| `create_invoice`, `create_bill` | W | Default **DRAFT** |
| `update_invoice`, `update_bill` | W | VOIDED/DELETED need `confirm` |
| `email_invoice` | W | ACCREC |
| `list_credit_notes`, `create_credit_note`, `allocate_credit_note` | R/W | |
| `list_quotes`, `create_quote` | R/W | |
| `list_purchase_orders`, `create_purchase_order` | R/W | |
| `list_repeating_invoices` | R | |
| `list_items` | R | |

## Payments

| Tool | R/W | Notes |
|------|-----|-------|
| `list_payments`, `get_payment` | R | |
| `create_payment` | W | Explicit amount + bank account |
| `delete_payment` | W | `confirm: true` |
| `list_batch_payments`, `create_batch_payment` | R/W | |
| `list_overpayments`, `allocate_overpayment` | R/W | |
| `list_prepayments`, `allocate_prepayment` | R/W | |

## Banking (ledger)

| Tool | R/W | Notes |
|------|-----|-------|
| `list_bank_transactions`, `get_bank_transaction` | R | Includes `IsReconciled` when present |
| `create_bank_transaction`, `update_bank_transaction` | W | Not feed matching |
| `list_bank_transfers`, `create_bank_transfer` | R/W | |

## Reports

| Tool | Scope family |
|------|----------------|
| `get_profit_and_loss` | profitandloss |
| `get_balance_sheet` | balancesheet |
| `get_trial_balance` | trialbalance |
| `get_executive_summary` | executivesummary |
| `get_bank_summary` | banksummary |
| `get_aged_receivables`, `get_aged_payables` | aged |

## Settings

| Tool | Description |
|------|-------------|
| `list_accounts` | Chart of accounts / bank accounts |
| `list_tax_rates` | Tax rates |
| `list_tracking_categories` | Tracking |
| `list_currencies` | Currencies |
| `get_organisation` | Org profile |

## Attachments

| Tool | R/W |
|------|-----|
| `list_attachments` | R |
| `upload_attachment` | W (base64, max 5MB in tool) |

## Agent guidance

1. Always establish **active organisation** before data tools.  
2. Prefer **filters** (`where`, `page`, date ranges) over full dumps.  
3. Create **DRAFT** documents unless the user explicitly wants AUTHORISED.  
4. For “reconcile the bank,” use payments + bank transactions + reports; do not invent statement-line match APIs.  
