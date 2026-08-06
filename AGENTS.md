# AGENTS.md — xero-mcp

Instructions for AI agents (and humans) contributing to this repository.

**Repository:** `derekclair/xero-mcp`  
**Local path:** `/Users/derekclair/Code/github.com/derekclair/xero-mcp`  
**Default branch:** `main`  
**Owner:** Derek Clair  
**Supermemory container:** `mpb-grok`

---

## What this project is

**xero-mcp** is a remote MCP server on Cloudflare Workers that lets coding / assistant agents interact with **Xero** organisations through a **curated, permission-gated** tool surface — not a raw Accounting API dump.

Capabilities (Phase 1):

1. **Dual-role OAuth** — MCP OAuth server + Xero OAuth client  
2. **Day-to-day tools** — contacts, AR/AP, payments, bank transactions, settings, reports, attachments  
3. **Least privilege** — consent presets `read` | `readwrite`; tools gated by granted scopes  
4. **Tenant isolation** — `xero-tenant-id` from validated `/connections` only  
5. **Write safety** — DRAFT defaults; destructive ops need `confirm: true`  

### Current state

| Piece | Reality |
| --- | --- |
| Lineage | Cloudflare `remote-mcp-github-oauth` demo, fully cut over to Xero |
| Auth | `src/auth/xero-handler.ts` — consent (read/readwrite), CSRF, Xero callback |
| Scopes | `src/auth/scopes.ts` — granular scopes only (post–Mar 2026 apps) |
| Client | `src/xero/client.ts` — fetch + tenant + refresh + DO token persistence |
| Tools | `src/mcp/tools/*` registered via scope-gated `registerAllTools` |
| DO class | `XeroMCP` matches `wrangler.jsonc` |
| Tests | `npm test` (scope gating unit tests) |
| Docs | `README.md`, `docs/SCOPES.md`, `SECURITY.md`, `TOOLS.md`, `LIMITATIONS.md` |
| KV | Placeholder ids in wrangler — create real namespace before deploy |
| Live smoke | Requires Xero app + Demo Company + secrets |

---

## Hard invariants (do not violate)

1. **Secrets never land in git.** No client secrets, tokens, or cookie keys. Local: `.dev.vars`. Prod: Wrangler secrets.

2. **Financial data is sensitive.** Do not log full invoices, bank lines, tax numbers, or token payloads. Prefer redaction.

3. **No unrestricted Xero proxy.** No tool that accepts arbitrary method/path/body. Every capability is an explicit MCP tool with Zod schema and allowlisted endpoints.

4. **Write tools require intent.** DRAFT by default. Void/delete need `confirm: true`.

5. **Tenant isolation is mandatory.** Tenant IDs must be in the user's connections. Fail closed if org context is missing.

6. **OAuth correctness over speed.** Keep CSRF, state session binding, consent, and granular scopes.

7. **Do not invent Xero API behaviour.** Prefer official docs. Bank-feed recon matching is **not** available via Accounting API — document honestly.

8. **Fail closed on authz.** Missing scopes, expired tokens, wrong tenant → clear error.

9. **No drive-by refactors.** Match existing style.

---

## Architecture

```text
MCP client
  → OAuthProvider (workers-oauth-provider)
      defaultHandler: XeroHandler (consent + Xero OAuth)
      apiHandler: XeroMCP.serve("/mcp")  # Durable Object
  → tools use XeroClient (tokens in DO storage after refresh)
```

| Concern | Location |
| --- | --- |
| Entry + DO | `src/index.ts` |
| Tool registration (scope-gated) | `src/mcp/register-tools.ts` |
| Domain tools | `src/mcp/tools/*` |
| Session props | `src/auth/props.ts` |
| Scope presets / TOOL_SCOPE_MAP | `src/auth/scopes.ts` |
| Xero OAuth UI | `src/auth/xero-handler.ts` |
| Approval helpers / CSRF | `src/workers-oauth-utils.ts` |
| Token HTTP helpers | `src/utils.ts` |
| Xero HTTP client | `src/xero/client.ts` |
| OAuth state | KV `OAUTH_KV` |

---

## Tool design guidelines

| Rule | Detail |
| --- | --- |
| Naming | Existing tools use short verbs (`list_invoices`); keep consistent |
| Description | Side effects + required scope family |
| Inputs | Zod; explicit amounts for money-moving tools |
| Outputs | Compact JSON; pagination via `src/xero/pagination.ts` |
| Errors | `src/xero/errors.ts` — never return secrets |
| Scopes | Add entries to `TOOL_SCOPE_MAP` when adding tools |

---

## Commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install deps |
| `npm start` | Local Worker port **8788** |
| `npm run type-check` | `tsc --noEmit` |
| `npm test` | Vitest unit tests |
| `npm run cf-typegen` | Regenerate Worker types |
| `npm run deploy` | Deploy (real KV id + secrets required) |

### Secrets

```text
XERO_CLIENT_ID
XERO_CLIENT_SECRET
COOKIE_ENCRYPTION_KEY
```

Optional: `XERO_SCOPES_OVERRIDE`, vars `XERO_AUTH_MODE`, `MCP_SERVER_NAME`.

---

## How to work

1. Read this file, `README.md`, `docs/SECURITY.md`, `src/auth/scopes.ts`.  
2. Small PRs: auth ≠ tools ≠ docs.  
3. After binding changes: `npm run cf-typegen` + `npm run type-check`.  
4. Persist architecture decisions to Supermemory (`mpb-grok`).  
5. Clean up temp probes; never commit secrets.

### Out of scope unless requested

- Bank Feeds API certification (`bankfeeds`)  
- Payroll / Assets / Projects / Files  
- Premium Journals  
- Non-Cloudflare hosting  

---

## Session handoff checklist

- [ ] `npm run type-check` and `npm test` green?  
- [ ] New tools added to `TOOL_SCOPE_MAP`?  
- [ ] KV id + secrets: real or still placeholder (never commit secrets)?  
- [ ] Docs still accurate for recon limitations?  
