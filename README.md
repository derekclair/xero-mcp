# xero-mcp

Remote **Model Context Protocol (MCP)** server for the **Xero Accounting API**, deployed on **Cloudflare Workers**.

Phase 1 focuses on day-to-day bookkeeping:

- **Receivables** — invoices, credit notes, quotes, aged AR  
- **Payables** — bills, purchase orders, aged AP  
- **Payments** — cash application, batch payments, over/prepayments  
- **Banking** — bank transactions & transfers (ledger side; see limitations)  
- **Reports** — P&L, balance sheet, trial balance, bank summary, executive summary  
- **Contacts & settings** — customers/suppliers, chart of accounts, tax rates  

**Permissions are first-order.** The server requests **granular Xero OAuth scopes** only, gates tools by granted scopes, isolates multi-org tenants via `xero-tenant-id`, and never exposes Xero tokens to the MCP client.

## Architecture

```
MCP client ──OAuth 2.1──► xero-mcp (Workers) ──OAuth 2.0──► Xero API
```

- MCP clients authenticate to this server (`workers-oauth-provider`).
- Users consent to a **read-only** or **read+write** Xero scope pack, then authorize at Xero.
- Tools call `https://api.xero.com/api.xro/2.0/*` with the user's tokens + tenant header.

## Quick start (local)

### 1. Xero app

1. Create a **Web app** at [developer.xero.com](https://developer.xero.com/app/manage).  
2. Redirect URI: `http://localhost:8788/callback` (and production URL when deployed).  
3. Select **granular** accounting scopes (required for new apps after March 2026). Prefer starting with read scopes; the consent UI requests the right set.  
4. Use the **Demo Company** for safe write testing.

### 2. Install & secrets

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars:
#   XERO_CLIENT_ID=...
#   XERO_CLIENT_SECRET=...
#   COOKIE_ENCRYPTION_KEY=<long random string>
```

Create a KV namespace and set the id in `wrangler.jsonc`:

```bash
npx wrangler kv namespace create OAUTH_KV
# paste id into wrangler.jsonc → kv_namespaces[0].id
```

### 3. Run

```bash
npm start
# http://localhost:8788/mcp
```

Inspector:

```bash
npx @modelcontextprotocol/inspector@latest
# Connect to http://localhost:8788/mcp
```

### 4. Deploy

```bash
npx wrangler secret put XERO_CLIENT_ID
npx wrangler secret put XERO_CLIENT_SECRET
npx wrangler secret put COOKIE_ENCRYPTION_KEY
npm run deploy
```

Point Xero redirect URI at `https://<worker>.workers.dev/callback`.

### Claude Desktop / mcp-remote

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["mcp-remote", "https://xero-mcp.<account>.workers.dev/mcp"]
    }
  }
}
```

## Permission model

| Layer | Behaviour |
|-------|-----------|
| Consent preset | **Read only** (default) or **Read + write** |
| Xero scopes | Granular only (`accounting.invoices`, `.read` variants, report scopes, …) |
| Tool registration | Tool is registered only if granted scopes cover it |
| Tenant | `list_organisations` / `set_active_organisation`; every API call uses `xero-tenant-id` |
| Org role | Connected Xero user's role still limits data (pass-through) |
| Writes | Invoices/bills default to **DRAFT**; void/delete require `confirm: true` |

See [docs/SCOPES.md](docs/SCOPES.md) and [docs/SECURITY.md](docs/SECURITY.md).

## Typical agent flow

1. `xero_whoami` / `list_organisations`  
2. `set_active_organisation` if multi-org  
3. `list_accounts` / `list_contacts` as needed  
4. `list_invoices` / `list_bills` / `get_aged_receivables` / reports  
5. Writes only if read+write was granted: `create_invoice` (DRAFT), `create_payment`, etc.

## Limitations (honest)

- **Bank recon matching** of feed statement lines is **not** fully available via Accounting API. Tools create/list **ledger** bank transactions. Certified **Bank Feeds API** is out of Phase 1.  
- **Journals** (`/Journals`) premium/gated — not included.  
- **Payroll, Assets, Projects, Files** — later phases.  

Details: [docs/LIMITATIONS.md](docs/LIMITATIONS.md) · tool catalog: [docs/TOOLS.md](docs/TOOLS.md).

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Local Worker |
| `npm run deploy` | Deploy to Cloudflare |
| `npm run type-check` | TypeScript |
| `npm test` | Unit tests (scopes) |
| `npm run cf-typegen` | Regenerate Worker types |

## References

- [Xero OAuth scopes](https://developer.xero.com/documentation/guides/oauth2/scopes/)  
- [Xero Accounting API](https://developer.xero.com/documentation/api/accounting/overview)  
- [Cloudflare remote MCP](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)  

## License

Private / TBD.
