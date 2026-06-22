# Operator Request - Helpan AI `helpan-kws-service` JWT issuance for Kipkiren WS

**To:** Silvia Mumbua (CTO · Helpan AI rail operator)
**From:** Kipkiren WS engineering · authored 4 June 2026
**Authority:** KWS Sprint 9 backlog §KWS-S9-002 (`helpan-kws-service` JWT role - KWS API) · Helpan H-8c agent admission (closed 21 May 2026 - `helpan-kws-v1` agent registered + 7 scopes seeded) · Helpan KWS Instruction Pack v1.0 §7.1
**Status:** 🟠 Pending operator handover - Helpan-side admission ALREADY COMPLETE; this request is for the service-account JWT
**Estimated operator effort:** ~15 min (JWT issuance + 1Password transfer)
**External lead time:** none

---

## 0. Why now

KWS Sprint 9 §S9-002 creates a `helpan-kws-service` JWT role inside the KWS API auth middleware. This is the role under which **all Helpan KWS agent calls** to the KWS API run. The agent's identity is `helpan-kws-v1` (admitted to Helpan registry at H-8c, 21 May 2026); the service-account JWT this request asks for is what the agent presents on each KWS API call.

Per Sprint 9 §S9-002 AC #7: *"Service account JWT issued and stored in Railway env vars as `HELPAN_KWS_SERVICE_JWT`. Never in code or committed files."*

---

## 1. What to return - 1 env var + 2 informational items

### 1.1 Env var

| Env var | Value type | Notes |
|---|---|---|
| `HELPAN_KWS_SERVICE_JWT` | RS256 JWT (string, ~500-800 chars) | Long-lived service account token for the `helpan-kws-service` role. Signed by Identiti's delegated-authority key class (per ID-16 paper-side delegation contract). Audience: `ws.kipkiren.co.ke`. Subject: `helpan-kws-service`. Scopes: per §1.2 below. |

**Hand over via 1Password:** item `KMV / Helpan / kws-service JWT`. Then `rm` any local file copies.

### 1.2 JWT shape (informational - KWS verifies these at every request)

```json
{
  "iss": "id.identiti.co.ke",                  // Identiti delegated-authority key
  "sub": "helpan-kws-service",                  // service account role identifier
  "aud": "ws.kipkiren.co.ke",                   // KWS API audience
  "scope": "kws.read.tickets kws.read.proformas kws.read.proforma_line_items kws.read.client_services kws.read.rate_card kws.read.agent_registry kws.write.audit_log",
  "agent_id": "helpan-kws-v1",                  // links to KWS agent_registry table (S9-001)
  "exp": <long-lived; suggest 90-day rotation>,
  "iat": <issuance time>,
  "jti": <unique token id>
}
```

KWS auth middleware (`apps/api/src/middleware/auth.ts`) verifies via the Identiti JWKS (`https://sandbox.id.identiti.co.ke/.well-known/jwks.json`) - the 2-key JWKS Identiti publishes today (step-up + delegated-authority) is exactly the pattern KWS verifies against.

### 1.3 Permission table (per Sprint 9 §S9-002 AC #2-4)

| Action | `helpan-kws-service` allowed? |
|---|---|
| READ `tickets` | ✅ |
| READ `proformas` | ✅ |
| READ `proforma_line_items` | ✅ |
| READ `client_services` | ✅ |
| READ `rate_card` (active entries only) | ✅ |
| READ `agent_registry` | ✅ |
| INSERT `audit_log` | ✅ (only INSERT - never UPDATE/DELETE per KWS-SEC-012) |
| **Proforma approval endpoint** | ❌ 403 always |
| **Invoice creation** | ❌ 403 |
| **Rate card modification** | ❌ 403 |
| **Payment initiation endpoints** | ❌ 403 |
| **All client portal routes** | ❌ 403 |
| **All `delivery_lead`-only admin routes** | ❌ 403 |

Test suite at S9-002 AC #5 + #6: minimum 6 explicit 403 assertions + minimum 4 explicit 200 assertions on the `helpan-kws-service` role.

### 1.4 No direct Supabase

Per Sprint 9 §S9-002 AC #8: *"No direct Supabase connection from any Helpan KWS service - all data access via KWS API using this JWT."* Helpan-side code must consume KWS API endpoints only. Confirm this is the architecture on the Helpan rail side.

---

## 2. Helpan-side context (already done - no operator action)

| Item | Helpan-side status |
|---|---|
| `helpan-kws-v1` agent admitted to Helpan registry | ✅ Shipped 21 May 2026 (H-8c close) |
| 7 scope catalogue rows seeded: `delivery.dispatch`, `discovery.query`, `kws.{dns,ssl,mx,domain,uptime}.write` (paper-only) | ✅ Shipped 21 May 2026 (migration 0010 + seed script) |
| Helpan KWS Instruction Pack v1.0 §7.1 specifies the JWT role contract | ✅ Authored April 2026 |

---

## 3. KWS-side commitments (informational)

| Item | Owner | Status |
|---|---|---|
| Tier 2 env: `HELPAN_KWS_SERVICE_JWT` validated via `requireFeatureEnv('helpan')` | KWS API | Authored at S9-002 |
| Auth middleware: new role added to JWT role enum alongside `delivery_lead`, `technical_delivery`, `client`, `admin` (AC #1) | KWS API | S9-002 |
| Permission matrix enforcement at route layer (AC #2-4) | KWS API | S9-002 |
| `GET /admin/agents` endpoint surfacing `agent_registry` (delivery_lead+admin only) (S9-001 AC #3) | KWS API | S9-001 |
| Identiti JWKS verification with 1-hour cache | KWS API | S9-002 |
| Test suite: 6+ explicit 403 + 4+ explicit 200 assertions | KWS API | S9-002 AC #5-6 |

---

## 4. How KWS activates this once delivered

The 1 env var goes into Railway service env. `requireFeatureEnv('helpan')` activates the feature lazily - routes that the Helpan service tries to call before the JWT is present return 503 cleanly. Once set, the auth middleware accepts the `helpan-kws-service` subject as a valid role and applies the permission matrix.

Identiti JWKS URL is a code constant in the auth middleware (mirroring Lunch Drop's pattern). No additional env needed for JWKS.

---

## 5. Operator checklist

1. ⏳ **Helpan rail-side / Identiti rail-side:** Issue the `helpan-kws-service` JWT signed by Identiti's delegated-authority key (per ID-16 paper contract). Audience `ws.kipkiren.co.ke`, subject `helpan-kws-service`, scopes per §1.2.
2. ⏳ Store the issued JWT in 1Password item `KMV / Helpan / kws-service JWT`.
3. ⏳ Hand 1Password share to KWS engineering.
4. ⏳ **KWS side:** set `HELPAN_KWS_SERVICE_JWT` Tier 2 env in Railway. Wire S9-002 auth middleware changes. Run test suite.

---

## 6. Rotation policy

JWT TTL suggestion: 90 days. Rotation procedure:
1. Helpan-side: issue new JWT.
2. Both old + new are valid for a 24h overlap window (KWS auth middleware accepts either via the JWKS, which holds both keys briefly).
3. KWS rotates Railway env var.
4. Helpan-side: revoke old JWT (or let it expire naturally).

Document in `docs/runbooks/helpan-jwt-rotation.md` at S9-002 close.

---

## 7. Cross-reference

- KWS Sprint 9 backlog: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\kws_sprint_9.md` §KWS-S9-002
- Helpan KWS Instruction Pack: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\helpan_kws_instruction_pack.md` §7.1
- KWS INSTRUCTION_PACK: [INSTRUCTION_PACK.md](./INSTRUCTION_PACK.md) §2 (cross-rail joints) + §8 (pre-flight)
- Helpan AI rail-side: `C:\Projects\helpan-ai-rail\` - H-8c admission complete; migration 0010
- Identiti rail-side: `C:\Projects\identiti\` - ID-16 KWS delegation contract paper; `/v1/internal/sign` is the delegated-authority signing surface

---

*Operator Request 2/2 · Helpan AI `helpan-kws-service` JWT issuance · 4 June 2026 · Confidential - Internal Use Only*
