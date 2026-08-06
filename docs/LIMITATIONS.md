# Limitations

## Bank reconciliation

Xero’s **Accounting API** does not fully automate the product UI workflow of matching **bank feed statement lines** to invoices/payments.

What this MCP **can** do:

- List/create **ledger** bank transactions (`/BankTransactions`) and transfers  
- Apply **payments** to invoices/bills  
- Report bank summary and filter transactions (e.g. unreconciled where supported)  
- Set `IsReconciled` in limited/conversion-style scenarios (use carefully)

What it **cannot** do (Phase 1):

- Certified **Bank Feeds API** statement push (`bankfeeds` scope)  
- Perfect parity with “Reconcile” click-matching in Xero UI  

## Journals

System **Journals** extract (`GET /Journals`) may require premium tiers / approval. Not exposed.

**Manual journals** are deferred (not in Phase 1 scope pack).

## Identity & multi-tenant

- User must re-authorise to change scope pack (read → read+write).  
- Connections can be revoked in Xero; tools will fail until re-auth.  
- Custom Connection mode is documented as optional single-org deploy (`XERO_AUTH_MODE`) — primary path is multi-tenant web app OAuth.

## Rate limits & volume

- Xero enforces concurrent and per-minute limits; tools surface HTTP 429.  
- List tools truncate large pages for LLM context; use paging.

## Roles

Even with broad scopes, a **read-only Xero user** cannot write. That is intentional and enforced by Xero.
