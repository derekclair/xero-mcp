# Security model

Accounting integrations only work if **access and permissions are respected**. This document is the threat model and operational rules for `xero-mcp`.

## Trust boundaries

1. **MCP client** (Claude, Grok, Inspector, etc.) — untrusted with Xero secrets.  
2. **xero-mcp Worker** — issues MCP tokens; holds Xero access/refresh tokens server-side.  
3. **Xero** — source of truth for data and org roles.

MCP clients **never** receive Xero access or refresh tokens.

## Authentication & authorization

### MCP OAuth (client ↔ server)

- OAuth 2.1 via `@cloudflare/workers-oauth-provider`
- Dynamic client registration at `/register`
- Authorization code + token endpoints
- CSRF on consent form (`__Host-CSRF_TOKEN`)
- OAuth `state` in KV + session-bound hash cookie (`__Host-CONSENTED_STATE`)
- Approved-client cookie HMAC-signed with `COOKIE_ENCRYPTION_KEY`
- CSP: `default-src 'none'`; `frame-ancestors 'none'`; `X-Frame-Options: DENY`

### Xero OAuth (server ↔ Xero)

- Authorization code flow to `login.xero.com` / `identity.xero.com`
- Granular scopes only (least privilege presets)
- Consent screen lists plain-language permissions and **read vs read+write**
- Refresh tokens stored in Durable Object storage (rotated on refresh)
- Never logged

## Permission enforcement

| Control | Implementation |
|---------|----------------|
| Least privilege scopes | Read default; write opt-in at consent |
| Tool gating | `canRegisterTool` hides tools without required scopes |
| Tenant isolation | `xero-tenant-id` from validated `/connections` only |
| Org role | Xero enforces; we surface 403/validation errors |
| Destructive writes | `confirm: true` for void/delete |
| Safe defaults | Invoice/bill status defaults to `DRAFT` |
| Rate limits | Surface 429 + Retry-After; no silent scope widening |

## Threats & mitigations

| Threat | Mitigation |
|--------|------------|
| Confused deputy (malicious MCP client) | Consent names client; approved-client cookie; redirect URI validation by OAuth provider |
| CSRF on authorize | CSRF token + state session binding |
| Token theft via logs/LLM | Redact tokens; tools never return tokens (`xero_whoami` redacts) |
| Cross-tenant access | Reject tenant IDs not in connections list |
| Over-privileged agent | Read-only preset; scope-gated tools |
| XSS on consent page | HTML escape client metadata; strict CSP |
| Subdomain cookie attack on workers.dev | `__Host-` cookie prefix |
| Refresh token rotation loss | Persist new tokens in DO storage after refresh |

## Secrets

```bash
wrangler secret put XERO_CLIENT_ID
wrangler secret put XERO_CLIENT_SECRET
wrangler secret put COOKIE_ENCRYPTION_KEY   # long random; signing cookies
```

Local: `.dev.vars` (gitignored). Never commit secrets, tokens, or cookie dumps.

## Operational checklist

- [ ] Redirect URIs exact match (local + production)
- [ ] KV namespace bound for OAuth state
- [ ] Cookie encryption key unique per environment
- [ ] Prefer Demo Company for write testing
- [ ] Review granted scopes in `list_granted_scopes` after connect
- [ ] Multi-org users must call `set_active_organisation`
- [ ] Monitor for 401/403 spikes (revoked connections)

## What we do not do

- Impersonate a different Xero user than the one who consented  
- Expand scopes without a new consent/re-auth  
- Implement fake “full bank recon” that the API does not support  
- Log bank account numbers, tokens, or full PII payloads  
