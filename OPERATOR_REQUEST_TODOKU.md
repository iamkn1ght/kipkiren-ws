# Operator Request - Todoku `kws` tenant creds handover for Kipkiren WS

**To:** Silvia Mumbua (CTO · Todoku rail operator)
**From:** Kipkiren WS engineering · authored 4 June 2026
**Authority:** KWS Sprint 9 backlog §KWS-S9-003 (Todoku SMS + webhook upgrade) · Todoku TD-13 tenant + template provisioning (closed 21 May 2026)
**Status:** 🟠 Pending operator handover - tenant + 5 templates ALREADY provisioned and approved on the Todoku rail side; this request is for credential transfer + the 5 template ULIDs
**Estimated operator effort:** ~30 min (creds from 1Password + template ULID lookup)
**External lead time:** none

---

## 0. Why now

KWS S1-S7 ran on email-only notifications (per Reboot Pack v2 §11 sprint statuses). Sprint 9 §S9-003 upgrades to full Todoku SMS + webhook on 5 KWS event types. The Todoku-side work is **already done**:
- `kws` tenant provisioned 21 May 2026 (TD-13 ticket close)
- 5 message templates registered + operator-approved on the rail

What's pending is credential handover so KWS can begin signing requests against the tenant.

---

## 1. What to return - 4 env vars + 5 template ULIDs

### 1.1 Env vars (Railway service env)

| Env var | Value type | Notes |
|---|---|---|
| `TODOKU_API_BASE` | URL string | Likely `https://todoku-prod-production.up.railway.app/v1` - confirm exact host. |
| `TODOKU_KWS_API_KEY` | UUID | The `kws` tenant `app_id`. Goes in `Authorization: Todoku-HMAC-SHA256 app_id=...` header. (Variable name per Sprint 9 backlog §S9-003 AC #7.) |
| `TODOKU_KWS_HMAC_SECRET` | BASE64 HMAC-SHA-256 (44 chars) | For multi-line canonical signing string `METHOD\nPATH\nCTYPE\nTIMESTAMP\nSHA256(body)`. Returns base64 HMAC, NOT hex (Todoku-specific encoding per its CONTRACT.md). |
| `TODOKU_KWS_WEBHOOK_SECRET` | BASE64 HMAC-SHA-256 (44 chars) | For verifying `X-Todoku-Signature` on inbound webhooks (delivery-status acks). |
| `TODOKU_KWS_SENDER_ID` | string | Per Sprint 9 backlog §S9-003 AC #1: `KIPS-WS` or nearest available equivalent per Todoku DLT/class rules. Confirm exact value approved by carrier filing. |

**Encoding gotcha:** Todoku uses base64, NOT hex (distinct from Identiti + KP which both use hex). The `loadRailConfig`-equivalent at KWS (currently in `apps/api/src/config/env.ts`) must validate the encoding shape if/when added.

### 1.2 The 5 template ULIDs (per Sprint 9 backlog §S9-003 AC #2)

Each template approved on the rail side carries a stable ULID. Wire these as constants in `apps/api/src/services/notifications.ts` (or equivalent) - placeholder strings (`KWS_TEMPLATE_PLACEHOLDER_<slug>`) at scaffold; SendService returns `TEMPLATE_NOT_READY` until ULIDs land.

| # | Template slug | Class | Body (canonical per Sprint 9 §S9-003) | Guards |
|---|---|---|---|---|
| 1 | `kws_proforma_dispatched` | class_1 | "Kipkiren WS: Your proforma [ref] is ready. KES [total] - review and approve at [portal_link]." | Standard (payment-related → anti-SE in copy) |
| 2 | `kws_payment_confirmed` | class_1 | "Kipkiren WS: Payment confirmed. Ref [gateway_ref]. Scope locked on [ticket_ref]. Work begins within 2 business days." | Standard (payment-related → anti-SE in copy) |
| 3 | `kws_sla_breach` | class_1 | "Kipkiren WS: We have flagged a delay on [ticket_ref]. Our team has been alerted. We will update you within [sla_hours] hours." | Standard |
| 4 | `kws_domain_expiry_30d` | class_2 | "Kipkiren WS: [domain] expires in 30 days. Renew now at [portal_link] - KES 1,800." | Standard |
| 5 | `kws_domain_expiry_7d` | class_2 | "Kipkiren WS: URGENT - [domain] expires in 7 days. Renew immediately at [portal_link]." | Standard |

**Note:** Anti-phishing on class_0 (OTP) is NOT applicable - KWS has no OTP flow at MVP (uses RS256 JWT issuer `ws.kipkiren.co.ke` for client portal auth, not Identiti step-up). Anti-social-engineering is implicit in the payment templates (#1, #2).

### 1.3 Sandbox phone receiver

Where do sandbox messages land? Whitelist for test SMEs OR captured-message log in the Todoku TD-16 portal? Need to know where to inspect outbound during KWS-S9-003 testing.

---

## 2. Webhook callback URL slot

Sprint 9 §S9-003 AC #3-#6 require Todoku async webhooks on 5 event types (proforma dispatched / payment confirmed / SLA breach detected / domain 30-day / domain 7-day). KWS API will expose:

- `POST /v1/webhooks/todoku/delivery` - delivery-status acks (success/failure)

Webhook receiver routes will be wired in S9-003 (after creds land). Operator just needs the URL `https://api.ws.kipkiren.co.ke/v1/webhooks/todoku/` registered against the `kws` tenant.

---

## 3. KWS-side commitments (informational - no operator action)

| Item | Owner | Status |
|---|---|---|
| Two-tier env extension: `TODOKU_KWS_*` Tier 2 vars + `requireFeatureEnv('todoku')` | KWS API | Built at S9-003 kickoff |
| Async send pattern - Todoku failure does NOT block primary transaction (AC #5) | KWS API | Built - log to `audit_log` event_type=`todoku_delivery_failed` |
| Successful delivery logged to `audit_log` (AC #6) | KWS API | Built |
| Template constant module: `apps/api/src/services/notifications.ts` with ULID lookup | KWS API | Authored at S9-003 |
| `actor` + `initiated_by` claim propagation on every Todoku call (§A.2) | KWS API | Built into client |

---

## 4. How KWS activates these once delivered

The 4 env vars go into Railway service env. `requireFeatureEnv('todoku')` activates the feature lazily: routes that try to send before all 4 are present throw a clean 503 rather than failing opaquely.

Template ULIDs replace placeholder constants in `apps/api/src/services/notifications.ts`. Until each template's ULID is wired, sends targeting that template return `TEMPLATE_NOT_READY` deliberately.

---

## 5. Operator checklist

1. ⏳ **Todoku rail-side:** Retrieve `kws` tenant creds from 1Password (item `KMV / Todoku / kws tenant`). Tenant + secrets generated at TD-13 close 21 May 2026.
2. ⏳ Look up the 5 template ULIDs from Todoku admin portal (TD-13 closed; ULIDs are stable).
3. ⏳ Confirm sender-ID approved value (likely `KIPS-WS` per Sprint 9 spec; verify against carrier registration).
4. ⏳ Hand the 4 env-var values + 5 template ULIDs + sender-ID + sandbox receiver detail to Kipkiren WS engineering.
5. ⏳ **KWS side:** set Tier 2 env in Railway service. Wire ULID constants in `apps/api/src/services/notifications.ts`. Build S9-003 webhook route and send pipeline.

---

## 6. Cross-reference

- KWS Sprint 9 backlog: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\kws_sprint_9.md` §KWS-S9-003
- KWS INSTRUCTION_PACK: [INSTRUCTION_PACK.md](./INSTRUCTION_PACK.md) §2 (cross-rail joints) + §8 (pre-flight)
- Todoku rail-side: `C:\Projects\todoku-prod\` · `docs/CONTRACT.md` (canonical signing string spec) · TD-13 tenant manifest
- Lunch Drop precedent: `C:\Projects\lunch drop\OPERATOR_REQUEST_TODOKU.md` - similar shape but new-tenant provisioning; KWS is creds-only (tenant already provisioned)

---

*Operator Request 1/2 · Todoku `kws` tenant creds handover · 4 June 2026 · Confidential - Internal Use Only*
