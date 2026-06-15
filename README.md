# Kipkiren WS

Kipkiren Teknolojia · `ws.kipkiren.co.ke`

Retainer + AI-priced-task SaaS platform. Not an agency. The AI task decomposition engine and the proforma scope-lock are the core differentiators — see `../kipkiren web services - inaugaral pack/kws_reboot_pack_v1.md` for the canonical product spec.

## Repo layout

```
kws/
├─ apps/
│  ├─ api/                Express 5 + TS API (Railway)
│  │  ├─ src/             code
│  │  ├─ db/migrations/   Postgres SQL — apply to Supabase eu-west-1
│  │  └─ db/seeds/
│  └─ client-portal/      React + Vite — ws.kipkiren.co.ke/portal
└─ packages/
   └─ shared/             Zod schemas, billing math, brand-shared types
```

> **admin-portal** is intentionally not scaffolded yet — `kws_admin_portal.html` is referenced in the reboot pack §13 but not present in the inaugural pack folder. Do not invent an admin UI before the canonical mockup is shared.

## UI port rule — IMPORTANT

The client portal is ported **verbatim** from `kipkiren web services - inaugaral pack/kws_client_portal_v3.html`. Do not redesign in React. The brand tokens, layout, copy, and the 4 payment-modal states are canonical. If any token, class, or copy needs to change, update the canonical HTML mockup first and re-port from there. See `MEMORY.md → match-canonical-ui` feedback memory for the full rule.

## Locked stack

- **Node 22 LTS · TypeScript 5 strict · Express 5**
- **Supabase / Postgres** in `eu-west-1` (Ireland) — aligned to the platform region standard. Resolves the af-south-1 vs eu-west-1 divergence in favour of Option B; see `DECISION_REGION_DIVERGENCE.md`. Supersedes the original af-south-1 / KWS-SEC-014 position. Cross-border transfer disclosed under KDPA 2019 §48–49 (wording pending counsel review).
- **Railway** for API hosting · **Cloudflare Pages** for portals
- **Anthropic Claude** (`claude-sonnet-4-6`) — dedicated KWS API key, never shared
- **Kipkiren Pay (LipaPlus)** for M-Pesa · **Paystack** direct for cards · never call Daraja directly (ADR-KWS-005)
- **JWT RS256** only — HS256 prohibited (KWS-SEC-001)

## Sprint 4 status — Admin, SLA, Capacity, Kamau

**Backend only.** The admin portal + task view React apps are blocked on the canonical `kws_admin_portal.html` which is referenced in the reboot pack but not present in the inaugural pack folder. Every endpoint the admin/task UIs will consume is built and tested, so when the mockup is shared the React port drops onto live data.

| Item | Status |
|---|---|
| `computeSlaDeadline()` + `slaStateFromDeadline()` + `formatRemaining()` | ✅ |
| Ticket creation stamps `sla_deadline_at` from plan × urgency matrix | ✅ |
| `loadQueue()` — SLA-sorted admin ticket queue | ✅ |
| `loadClientAccounts()` — MRR, open tickets, breach counts, MTD charges | ✅ |
| `loadCapacitySnapshot()` — open/ai_draft/dispatched/breaches/MRR/approval rate | ✅ |
| `GET /v1/admin/queue` | ✅ |
| `GET /v1/admin/clients` | ✅ |
| `GET /v1/admin/capacity` | ✅ |
| `PUT /v1/admin/rate-card/:id` — strict admin only + audit_log before/after (KWS-SEC-009) | ✅ |
| `PUT /v1/tickets/:id/assign` — delivery_lead/admin, assignee role-checked | ✅ |
| `PUT /v1/tickets/:id/status` — Kamau limited to assigned + allowed transitions | ✅ |
| `GET /v1/tasks` + `GET /v1/tasks/:id` — PII-stripped serializer (ADR-KWS-003) | ✅ |
| SLA math test suite (plan × urgency matrix + state + format) | ✅ |
| Kamau PII-stripping regression test (exact key-set allow-list) | ✅ |
| Role-gate tests for assign + status transition | ✅ |
| Admin portal React app | ⏳ blocked on canonical `kws_admin_portal.html` |
| Task view React app (Kamau) | ✅ `apps/task-view` — ported from `kws_task_view.html`, gated to technical_delivery |
| Background job runner (inline decomposition OK for MVP) | ⏳ deferred to v2 |

## Sprint 3 status — Approval, Payments, Scope Lock

| Item | Status |
|---|---|
| `verifyKipkirenPaySignature()` HMAC-SHA256 (KWS-SEC-003) | ✅ |
| `verifyPaystackSignature()` HMAC-SHA512 (KWS-SEC-006) | ✅ |
| Raw-body capture in express.json `verify` hook | ✅ |
| Kipkiren Pay client adapter (real + test seam) | ✅ |
| Paystack client adapter (real + test seam) | ✅ |
| `POST /v1/proformas/:id/approve` — recompute hash, rate-limited 3/hr/proforma, initiate STK or Paystack | ✅ |
| `POST /v1/webhooks/mpesa` — HMAC + idempotency + amount match + replay defence | ✅ |
| `POST /v1/webhooks/paystack` — signature + 5-min window + replay defence | ✅ |
| `GET /v1/invoices` handler | ✅ |
| HMAC test suite (10 tests — algorithm confusion, tamper, wrong secret, missing header) | ✅ |
| Webhook perimeter tests (signature, timestamp window, event filter, malformed payload) | ✅ |
| Live E2E with Chamia's real Safaricom number | ⏳ Chamia |
| RLS-bound integration tests for full confirmation → scope_lock chain | ⏳ Needs staging Supabase |

## Sprint 2 status — Tickets, AI Decomposition, Proformas

| Item | Status |
|---|---|
| Rate card seed `db/seeds/rate_card_v1.sql` (40 entries, 5 categories) | ✅ |
| `sanitiseTicketDescription()` with prompt-injection corpus (KWS-SEC-005 layer 1) | ✅ |
| AI Decomposition Service (Claude prompt + Zod validation + rate-card reconciliation) | ✅ |
| `computeContentHash()` (SHA-256, ADR-KWS-001) | ✅ |
| `writeAuditEvent()` helper for KWS-SEC-012 events | ✅ |
| `createDraftProforma()` + `dispatchProforma()` services | ✅ |
| `POST /v1/tickets` handler (rate-limited 10/hr/client) | ✅ |
| `PUT /v1/proformas/:id/review` handler (edit + dispatch) | ✅ |
| Sanitiser test corpus (13 attack patterns + benign + zero-width evasion) | ✅ |
| Decomposition tests with fake Claude client (happy path, price manipulation, fabricated tasks, schema fail, sanitiser-runs-first) | ✅ |
| Admin portal AI Review tab wired to live data | ⏳ S2 polish |
| Background job runner for decomposition (currently inline) | ⏳ S4 |

## Sprint 1 status

| Item | Status |
|---|---|
| Monorepo scaffold (pnpm workspaces) | ✅ |
| API skeleton with helmet, CORS, pino, Zod env loader | ✅ |
| Auth middleware: RS256 verify + role guard (KWS-SEC-001, 007) | ✅ |
| Schema migration `0001_schema.sql` (15 tables) | ✅ |
| RLS migration `0002_rls.sql` (KWS-SEC-002) | ✅ |
| INSERT-only enforcement `0003_insert_only.sql` (ADR-KWS-001, KWS-SEC-004/012) | ✅ |
| Shared Zod schemas + billing math + canonical content-hash payload | ✅ |
| Client portal Vite shell with brand tokens | ✅ |
| Admin portal Vite shell | ✅ |
| `/v1/auth/login` + `/refresh` + `/logout` with rotating refresh + family invalidation | ✅ |
| `/v1/.well-known/jwks.json` with stable kid | ✅ |
| Rate limiters: login 5/15min, ticket-create 10/hr/client, approve 3/hr (KWS-SEC-010) | ✅ |
| Vitest: Kamau 403 penetration suite + HS256 rejection + role matrix | ✅ |
| Vitest: billing math + canonical content-hash determinism | ✅ |
| Vitest: RLS cross-client isolation (skips unless `KWS_RLS_TEST_*` env set) | ✅ |
| Supabase project provisioned in eu-west-1 | ✅ live (`qderqzcyyhnfphrswexm`) |
| Railway project provisioned + secrets loaded | ⏳ Chamia |
| RS256 keypair generated and base64 in Railway env | ⏳ Chamia |
| RLS test fixtures applied to staging Supabase | ⏳ Chamia |

## Getting started

```bash
pnpm install
cp apps/api/.env.example apps/api/.env  # populate from Railway secrets
pnpm --filter @kws/shared build
pnpm dev                                 # runs api + both portals in parallel
```

## Generating the JWT RS256 keypair

```bash
# 2048-bit RSA — keep the private key OUT of git, store base64 in Railway only
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out kws-jwt.key
openssl rsa -pubout -in kws-jwt.key -out kws-jwt.pub

# Encode for Railway env vars
base64 -w0 kws-jwt.key   # → JWT_PRIVATE_KEY_PEM_B64
base64 -w0 kws-jwt.pub   # → JWT_PUBLIC_KEY_PEM_B64
```

Rotate every 90 days. Keep the previous public key in JWKS for ≥7 days during the rotation window.

## Running tests

```bash
pnpm --filter @kws/api test
```

The auth/role/billing suites need no external services — they spin up a per-process RS256 keypair in `test/setup.ts`. The RLS isolation suite skips unless you populate:

```
KWS_RLS_TEST_URL
KWS_RLS_TEST_ANON_KEY
KWS_RLS_TEST_CLIENT_A_JWT
KWS_RLS_TEST_CLIENT_B_JWT
KWS_RLS_TEST_CLIENT_A_TICKET_ID
```

Point those at a staging Supabase project that has migrations 0001..0003 applied and two seeded clients.

## Applying migrations

Migrations are plain SQL — apply via Supabase SQL editor or `psql` against the eu-west-1 project, in numerical order:

```
apps/api/db/migrations/0001_schema.sql
apps/api/db/migrations/0002_rls.sql
apps/api/db/migrations/0003_insert_only.sql
apps/api/db/seeds/retainer_plans.sql
apps/api/db/seeds/rate_card_v1.sql
```

**The project region is `eu-west-1` (Ireland)** per the resolved region decision (Option B — see `DECISION_REGION_DIVERGENCE.md`), which supersedes the original af-south-1 / KWS-SEC-014 requirement. Region cannot be changed post-launch without a full migration.

## Architectural invariants — do not break

1. `proforma_approvals` is INSERT-only. Enforced at the database via revoked grants AND a hard trigger that rejects UPDATE/DELETE for every role including service. (ADR-KWS-001, KWS-SEC-004)
2. `audit_log` is INSERT-only, never deleted. Same enforcement. (KWS-SEC-012)
3. `payments` rows become immutable once `status = confirmed`. Trigger-enforced.
4. `proforma.content_hash` is set at dispatch and frozen — line items cannot change after dispatch, the hash cannot change, and `proforma_approvals` inserts must carry a matching `content_hash_at_approval` (verified by trigger).
5. `technical_delivery` (Kamau) has zero client-facing API surface. Enforced in Express middleware AND in RLS — UI restriction is not security. (ADR-KWS-003, KWS-SEC-007)
6. Rate card writes require `admin` role (not `delivery_lead`) — KWS-SEC-009.
7. JWT is RS256 only. The auth middleware passes `algorithms: ['RS256']` to `jwt.verify`, which actively rejects HS256 tokens.

## Naming

"**Kipkiren WS**" is the public/client-facing form. "KWS" is acceptable in code, internal docs, and ticket refs only.
