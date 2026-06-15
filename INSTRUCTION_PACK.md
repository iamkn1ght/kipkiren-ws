# Kipkiren WS — Build Instruction Pack

**Document type:** Self-contained build instruction pack for a fresh Claude session continuing work on Kipkiren Web Services.
**Date:** 4 June 2026.
**Authority:** Kipkiren WS Reboot Pack v2.0 (April 2026, supersedes v1.0) · KWS Sprint 9 Backlog · McKinsey Agentic AI Advisory v1.0 · Helpan KWS Instruction Pack v1.0 · Platform Rails Reboot Pack v1.3 (23 May 2026) — see §3 region divergence.
**Owner:** Chamia Mutuku (CEO & CPO), Kipkiren Teknolojia · CTO: Silvia Mumbua.
**Target repo:** `C:\Projects\kipkiren_web_services\kws\` (this folder).
**Status:** 🟢 **S1–S7 substantially built (7 commits on `main`, last commit `b8a82cd`).** 🟡 S5/S6 CEO actions outstanding · S7 privacy review pending · S8 + S9 not started. Cross-rail consuming-side joints all CLOSED.

---

## 0. Read this first — Kipkiren WS in one paragraph

Kipkiren WS is **Kipkiren Teknolojia's enterprise web services division** — a subscription-plus-task SaaS platform for Kenyan SMEs. Clients pay a monthly retainer for SLA + access; tasks are priced and approved on a proforma basis via an AI decomposition engine before any work begins. It is NOT a rail. It is the most-built app in the KMV portfolio at this date — S1 through S7 are substantially shipped in production-bound code at `apps/api/src/` + the two React portals (`apps/admin-portal` + `apps/client-portal`). Sprint 9 (the McKinsey-advisory-aligned agentic execution tier with Helpan KWS Phase 1) is the next-major workstream. All three platform-rails that KWS will integrate with — Helpan AI (`helpan-kws-v1` admitted), Identiti (KWS delegation contract ID-16), Todoku (`kws` tenant + 5 templates) — have already shipped their producer-side surfaces on 21–22 May 2026.

The job of this pack: give a fresh Claude session everything needed to **finish the S3-S7 tails, ship S8 beta, and scaffold S9** without re-reading the whole KWS doc corpus.

---

## 1. Where things stand — current code state

### 1.1 Repo layout (on disk at `C:\Projects\kipkiren_web_services\kws\`)

```
kws/
├─ apps/
│  ├─ api/            Express 5 + TS strict + Zod + Pino + JWT RS256 + Anthropic SDK
│  │  ├─ src/
│  │  │  ├─ routes/   admin · auth · health · invoices · jwks · onboarding · proformas · services · tasks · tickets · webhooks
│  │  │  ├─ services/ admin-views · audit · decomposition · payments · proforma · sanitise · sla · uptime
│  │  │  ├─ middleware/ auth · error · rate-limit
│  │  │  ├─ config/   env.ts (two-tier — see §1.3)
│  │  │  └─ lib/
│  │  └─ db/migrations/  0001_schema · 0002_rls · 0003_insert_only · 0004_s7_onboarding_consent
│  ├─ admin-portal/   React + Vite (Cloudflare Pages) — wired to live admin API
│  └─ client-portal/  React + Vite (Cloudflare Pages) — wired to live client API
└─ packages/
   └─ shared/         Zod schemas, billing math, brand-shared types
```

### 1.2 Sprint progress vs canonical S1–S9 (Reboot Pack v2 §11)

| Sprint | Title | Code state | Outstanding |
|---|---|---|---|
| S1 | Scaffold, Schema, Auth & RLS | ✅ CLOSED | — |
| S2 | Tickets, AI Decomposition, Proformas | ✅ CLOSED | — |
| S3 | Approval, Payments, Scope Lock | 🟢 SUBSTANTIALLY CLOSED | KWS-S3-012 live M-Pesa E2E with Chamia's real Safaricom number (CEO action) · RLS-bound integration tests with staging Supabase |
| S4 | Admin Portal & SLA Monitoring | 🟢 BACKEND CLOSED · ADMIN UI WIRED | Task view React app (Kamau) — per README S4 status |
| S5 | Google Cloud + Microsoft CSP | 🟡 BLOCKED on CEO actions | GCP Partner Advantage application (KWS-S5-001) · Digital Leader cert (KWS-S5-002) · Microsoft CSP via Westcon/Ingram (KWS-S5-003) · then reseller integration code |
| S6 | Hosting, Domain & Uptime | 🟡 PARTIAL | Latest commit shipped uptime pinger + add-service form. Domain registration + DNS panel + monthly cost real-time accuracy (§S6 AC update for S9 dependency) outstanding |
| S7 | SEO, Social & KDPA | 🟡 PARTIAL | Latest commit shipped DSAR + privacy policy + SEO/social display. KWS-S7-005 privacy-policy legal review (CEO action) |
| S8 | First 5 Clients & Beta Close | ❌ NOT STARTED | Recruit 5 beta SMEs (mix Growth/Business/P3) — CEO action · SLA audit · AI decomposition accuracy iteration |
| S9 | **Agentic Execution Tier & Scale 1 Infrastructure** | ❌ NOT STARTED | 9 tickets per `kws_sprint_9.md`. Helpan KWS Phase 1 live · agent_registry · helpan-kws-service JWT role · Todoku SMS upgrade (5 templates) · DNS/SSL autonomous scaffold (feature-flagged OFF) · observability foundation · GCP cost scan · admin portal updates |

**Total scope:** 87 tickets across 9 sprints (Reboot Pack v2 §11). Roughly 60% shipped, 25% blocked on CEO actions, 15% net-new (S9).

### 1.3 Two-tier env (apps/api/src/config/env.ts)

Critical to understand before touching deployment:

**Tier 1 (REQUIRED at boot):** `SUPABASE_URL` · `SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `JWT_PRIVATE_KEY_PEM_B64` · `JWT_PUBLIC_KEY_PEM_B64` · `JWT_ISSUER` · `JWT_AUDIENCE` · `ALLOWED_ORIGINS`

**Tier 2 (OPTIONAL at boot, REQUIRED when feature exercised):** `ANTHROPIC_API_KEY` (AI decomposition) · `KIPKIREN_PAY_BASE_URL/API_KEY/HMAC_SECRET` (M-Pesa) · `PAYSTACK_SECRET_KEY/WEBHOOK_SECRET` (cards)

Routes guarded by Tier 2 vars throw a clean 503 via `requireFeatureEnv()` when env is missing. **This means you can deploy to Railway TODAY with only Tier 1 set** and get a green `/v1/health` + JWKS; S2/S3 light up as creds land.

**S9 will add new Tier 2 features:** `TODOKU_KWS_API_KEY` + `TODOKU_KWS_SENDER_ID` (S9-003) · `HELPAN_KWS_SERVICE_JWT` (S9-002). See [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md) + [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md).

### 1.4 Git state

- Branch: `main`
- Remote: `origin/main` (in sync)
- 7 commits, all by Chamia/Claude. Latest: `b8a82cd feat: S6 add-service form + uptime pinger, S7 DSAR + privacy policy + SEO/social display`

---

## 2. Cross-rail joints — producer-side status

All three platform-rails that KWS consumes have shipped their producer-side surfaces. Use them; don't re-design.

| Joint | Producer-side status | KWS-side status |
|---|---|---|
| **Helpan H-8c** — admit `helpan-kws-v1` agent + 7 scope catalogue rows | ✅ Shipped 21 May 2026 (migration 0010 + seed; `delivery.dispatch`, `discovery.query`, `kws.{dns,ssl,mx,domain,uptime}.write` paper-only) | ❌ Not consumed yet (S9-001/002/008 work) |
| **Identiti ID-16** — KWS delegation contract Phase 2 | ✅ Shipped 22 May 2026 (paper — Helpan signs `kws_*` delegations; Identiti publishes JWKS) | ❌ Not consumed yet — KWS uses its own RS256 JWT issuer today (`ws.kipkiren.co.ke`). Identiti delegation lights up at Scale 2 per Reboot Pack v2 §12 |
| **Todoku TD-13** — `kws` tenant + 5 templates | ✅ Shipped 21 May 2026 (tenant + 5 templates approved on the rail) | ❌ Not consumed yet — KWS uses email at MVP per Sprint 9 §S9-003. Upgrade is the headline S9 ticket. |
| **Kipkiren Pay** (M-Pesa STK + webhooks per ADR-KWS-005) | ✅ KP-3/4/5 live (Daraja sandbox wired since 21 May) | ✅ WIRED via Tier 2 env + `services/payments.ts` Kipkiren Pay client adapter. KWS-S3-012 live E2E with real Safaricom number outstanding (CEO action) |
| **Paystack direct** (cards per ADR-KWS-005; LipaPlus card path deferred to v2) | n/a (external) | ✅ WIRED via Tier 2 env + Paystack client adapter |

**On Identiti for KWS auth specifically:** KWS issues its own RS256 JWT for client portal sessions (not Identiti) — this is correct per Reboot Pack v2 §3. KWS clients are SMEs with portal logins, not consumer Account UUIDs. Identiti integration enters at Scale 2 for the delegation-of-authority surface (Helpan KWS executes autonomous DNS/SSL on the client's behalf, signed via Identiti `/v1/internal/sign`).

---

## 3. ✅ RESOLVED — region divergence (af-south-1 vs eu-west-1) → eu-west-1

**Resolved 15 Jun 2026 to Option B (eu-west-1).** On inspection the live Supabase project (`qderqzcyyhnfphrswexm`) and Railway deploy were **already in eu-west-1** — the af-south-1 docs never matched reality. Repo docs reconciled. Residual: counsel review of the KDPA §48–49 cross-border-transfer disclosure wording. The original analysis is retained below for the record.

| Source | Position |
|---|---|
| KWS Reboot Pack v2 §3 (April 2026) | "Supabase **af-south-1** (Cape Town) — mandatory. eu-west-1 prohibited." (KWS-SEC-014; CBK rationale) |
| KWS README · RAILWAY.md | af-south-1 (Cape Town) required at first deploy |
| Platform Rails Reboot Pack v1.3 §13.4 (23 May 2026) | "eu-west-1 for all current builds. **af-south-1 is aspirational. Do not use af-south-1 for any new build until this changes.**" |

The platform-wide standard (v1.3) post-dates and arguably supersedes KWS v2 (April 2026). But KWS has its own KWS-SEC-014 finding referencing CBK requirements that v1.3 doesn't address head-on.

**Three resolutions (Chamia chooses):**

A) **KWS keeps af-south-1 as documented exception.** Add KWS to the LipaStack-style explicit-exception list (the only other documented stack exception per Reboot Pack v1.3 §12). Reason: KWS-SEC-014 CBK position. Risk: aspirational region per platform standard; Supabase outages in af-south-1 hit KWS only.

B) **KWS migrates to eu-west-1.** Re-provision · run migrations 0001–0004 · re-seed · update README + RAILWAY.md + KWS-SEC-014 finding · update Reboot Pack v2 to v2.1. Risk: KWS-SEC-014 CBK rationale needs re-examination by counsel before flipping (may be in CBK requirement, may not).

C) **Stay on af-south-1 for now; flag for Reboot Pack v1.4.** No code change. Document the divergence; Chamia chooses formally before S8 production cutover.

Full advisory at [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md). **Do not provision a new Supabase project or run migrations against a new region without this decision signed off.**

---

## 4. Canonical docs to read in order

All paths relative to `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\` (NOT a git repo — edits save direct).

**Phase 0 — KWS-specific (read in detail):**
1. `newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_reboot_pack_v2.md` — **THE canonical product spec.** Supersedes inaugural pack v1.
2. `newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_sprint_9.md` — Sprint 9 backlog (9 tickets).
3. `newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_mckinsey_advisory.md` — McKinsey agentic AI advisory; Sprint 9 work is grounded here.
4. `newdocs/Kipkiren Web Services-Sprint 9-Helpan/helpan_kws_instruction_pack.md` — Helpan KWS agent contract; specifies the `helpan-kws-service` JWT role + Phase 1 capabilities.

**Phase 1 — KWS inaugural pack (historical reference + UI mockups):**
5. `newdocs/kipkiren web services - inaugural pack/kws_reboot_pack_v1.md` — superseded by v2; retain for traceability.
6. `newdocs/kipkiren web services - inaugural pack/kws_architecture_v1.md` — 14 SEC findings + 5 ADRs detail. Still canonical.
7. `newdocs/kipkiren web services - inaugural pack/kipkiren-ws-mvp.md` — investor-facing MVP brief.
8. `newdocs/kipkiren web services - inaugural pack/kws_client_portal_v3.html` — **canonical client portal UI** (port verbatim per README "UI port rule").
9. `newdocs/kipkiren web services - inaugural pack/kws_admin_portal.html` — canonical admin portal UI.
10. `newdocs/kipkiren web services - inaugural pack/kws_rate_card_v1.html` — 41-entry rate card seeded in DB at S1.

**Phase 2 — Platform context (orient):**
11. `may23rd/Platform Rails Integration and reboot/Platform_Rails_Reboot_Pack_v1_3.md` §13 (platform-wide stack standards) + §14 (KWS context).
12. `RECAP.md` §1.3 — find KWS row and master cross-rail state.

---

## 5. Stack — locked decisions

**KWS is an APP, not a rail.** App-side flexibility on stack choices is OK; some KWS choices deliberately differ from the rail standard.

| Layer | KWS choice | Rail standard | OK? |
|---|---|---|---|
| Runtime | Node 22 LTS | Node 22 LTS | ✅ aligned |
| Language | TypeScript 5 strict | TypeScript 5 strict | ✅ |
| Framework | **Express 5** | Fastify 4 | ⚠ DIVERGES — acceptable for app; do not migrate |
| Auth | JWT RS256 (own issuer `ws.kipkiren.co.ke`) | Per-rail HMAC + Identiti for consumer apps | ⚠ DIVERGES — KWS clients are SME portals, not consumer Account UUIDs; correct for context |
| Validation | Zod 3 | AJV 2020-12 | ⚠ DIVERGES — acceptable; KWS uses Zod because Express 5 idiom |
| Database | ~~Supabase af-south-1~~ | **Supabase eu-west-1** | ✅ **RESOLVED → eu-west-1 (see §3)** |
| Deploy | Railway | Railway | ✅ |
| Edge | Cloudflare (Pages for portals) | Railway-only for rails | ⚠ acceptable for app |
| AI | Anthropic Claude `claude-sonnet-4-6` (dedicated KWS key) | Anthropic Claude (per app) | ✅ |
| M-Pesa | Kipkiren Pay only (ADR-KWS-005 — never direct Daraja) | KP rail | ✅ aligned |
| Card payments | Paystack direct (MVP) → LipaPlus v2 | Per app | ✅ |

**Hardlocks (must not change without ADR):**
- ADR-KWS-001: Proforma approval is SHA-256 cryptographically verified
- ADR-KWS-002: Human-in-the-loop for all AI proformas at MVP (exception-based at Scale 1 with S9-006 gate conditions)
- ADR-KWS-003: Kamau has zero client-facing API surface
- ADR-KWS-004: Rate card in database, not application config
- ADR-KWS-005: M-Pesa via Kipkiren Pay only

---

## 6. Sprint plan — immediate-next workstreams

### 6.1 Tail-end (close before S8)

**S3 close (~½ day):**
- Live M-Pesa E2E with real Safaricom number (CEO action — Chamia executes)
- RLS-bound integration tests against staging Supabase (post-region-decision)

**S4 close (~1 day):**
- Task view React app (Kamau) — Kamau-only PII-stripped view; backend endpoints `GET /v1/tasks` + `GET /v1/tasks/:id` already exist with PII-stripping per ADR-KWS-003

**S5 (BLOCKED on CEO actions — multi-week external lead):**
- GCP Partner Advantage application (Chamia)
- Google Cloud Digital Leader certification (Chamia)
- Microsoft CSP Indirect via Westcon/Ingram (Chamia)
- THEN: reseller provisioning flows in code

**S6 close (~2 days):**
- Hosting management panel (full) · domain registration + DNS (Cloudflare API) · monthly cost real-time accuracy on `client_services` fields per S6 AC update (S9 dependency)

**S7 close (~½ day):**
- Privacy Policy legal review (CEO action — counsel review before publishing)

### 6.2 S8 — Beta close (~2 weeks)

Per Reboot Pack v2 §14:
- Recruit 5 beta SME clients (Chamia — mix 1+ Growth, 1+ Business, 1+ Mwangi P3 archetype)
- Confirmed in writing
- SLA audit · iterate on AI decomposition accuracy

### 6.3 S9 — Agentic Execution Tier (~3 weeks, 9 tickets)

Per `kws_sprint_9.md`:
- **KWS-S9-001** Agent registry table + `GET /admin/agents` (delivery_lead only)
- **KWS-S9-002** `helpan-kws-service` JWT role + scoped permissions + 6 explicit 403 + 4 explicit 200 tests — **needs [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md)**
- **KWS-S9-003** Todoku SMS + webhook upgrade (5 templates) — **needs [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md)**
- **KWS-S9-004** DNS autonomous execution scaffold (feature-flagged OFF; per-client toggle)
- **KWS-S9-005** SSL renewal autonomous execution scaffold (feature-flagged OFF)
- **KWS-S9-006** Observability foundation per hosted site
- **KWS-S9-007** GCP cost intelligence monthly scan
- **KWS-S9-008** Helpan KWS Phase 1 PROD — proforma enrichment + confidence + SLA early warning (≥5 active clients)
- **KWS-S9-009** Sprint 9 integration test (full agentic flow e2e — gate test before Scale 1 client onboarding)

Sprint 9 Definition of Done: Helpan KWS Phase 1 live with ≥5 active clients · agent_registry seeded · Todoku SMS on 5 event types · DNS/SSL scaffolded behind feature flags · observability collecting · GCP scan monthly · admin portal updated with enrichment panel + site health + cost insights.

---

## 7. Hard rules — non-negotiable

1. **Code as files only, never chat blocks.**
2. **KES minor units only** (in proforma totals, payment amounts).
3. **`proforma_approvals` is INSERT-only** (ADR-KWS-001/002 — no UPDATE, no DELETE, ever).
4. **`audit_log` is INSERT-only** (KWS-SEC-012).
5. **Kamau has zero client-facing API surface** (ADR-KWS-003 — middleware enforces).
6. **M-Pesa via Kipkiren Pay only** (ADR-KWS-005 — never direct Daraja).
7. **JWT RS256 only** — HS256 prohibited (KWS-SEC-001).
8. **Match-canonical-UI rule** — the client portal is ported verbatim from `kws_client_portal_v3.html`. Do not redesign in React. Same for admin portal once canonical mockup is referenced.
9. **No `Co-Authored-By: Claude` commit trailers** · no "Generated with Claude Code" footers.
10. **Confirm scope before destructive ops** (drop columns, drop tables, region migration).
11. **Update [RECAP.md](./RECAP.md) at every sprint close.**
12. **Region decision pending** — do not provision new Supabase or run new migrations without §3 decision.

---

## 8. Pre-flight checklist — before next session starts

**Operator-actionable asks now authored as standalone request docs:**
- [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md) — `kws` tenant API key + 5 template ULIDs (TD-13 already provisioned 21 May; just need creds + ULID handover)
- [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md) — `helpan-kws-service` JWT issuance (H-8c agent admission already done 21 May; need the service-account JWT)

**Chamia decisions outstanding:**
- [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md) — af-south-1 vs eu-west-1 (THE blocking decision for S8 cutover)
- CEO actions per Reboot Pack v2 §14 (GCP Partner, Digital Leader cert, Microsoft CSP, M-Pesa live E2E, Privacy Policy legal review, beta-client recruitment)

**Confirm before code work:**
- [ ] Region decision signed
- [ ] Railway service running latest commit `b8a82cd` (verify `/v1/health` green)
- [ ] Supabase migrations 0001–0004 applied to current project
- [ ] Tier 2 env: Anthropic key live · Kipkiren Pay sandbox creds live · Paystack sandbox creds live
- [ ] Helpan + Todoku creds queued for S9 sprint kickoff

---

## 9. First-steps checklist — once the new session starts

1. Read this entire pack.
2. Read [STARTUP_PROMPT.md](./STARTUP_PROMPT.md) for the tight session-start brief.
3. Read [RECAP.md](./RECAP.md) for the live sprint state.
4. Read the canonical docs in §4 in order (Phase 0 + Phase 1 minimum — budget ~90 min).
5. Confirm pre-flight (§8) with Chamia. Block on region decision; proceed on other items as scoped.
6. Pick a workstream from §6 — start with S3-S7 tails (low-risk, high-momentum) or S9-001 (agent_registry table — also low-risk, sets up the rest).
7. **Do not write speculative features.** Every line maps to a sprint ticket; tickets map to `kws_sprint_9.md` (S9) or the inaugural sprint backlog (S1-S8 reference: `kws_sprint_backlog.md`).
8. Update RECAP.md at every sprint close.

---

## 10. Reference index

**Active code:**
- `apps/api/src/` — Express API (11 routes, 8 services, 3 middleware, two-tier env)
- `apps/admin-portal/src/` — Delivery Lead + Kamau React UI
- `apps/client-portal/src/` — SME client React UI (port from canonical HTML mockup)
- `apps/api/db/migrations/` — 4 migrations applied
- `packages/shared/` — Zod schemas, billing math

**Repo-side docs:**
- [README.md](./README.md) — existing repo orientation (DO NOT replace — augments this pack)
- [RAILWAY.md](./RAILWAY.md) — deploy click-path for first Railway deploy
- [INSTRUCTION_PACK.md](./INSTRUCTION_PACK.md) — this document
- [RECAP.md](./RECAP.md) — sprint state tracker (created by this pack)
- [STARTUP_PROMPT.md](./STARTUP_PROMPT.md) — copy-pasteable session start
- [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md) · [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md)
- [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md)

**Canonical docs:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\` (v2 + Sprint 9 + McKinsey + Helpan KWS instruction pack) + `newdocs\kipkiren web services - inaugural pack\` (v1, architecture, UI mockups).

**Other rails Kipkiren WS depends on:**
- `C:\Projects\helpan-ai-rail\` — H-8c agent admission completed; helpan-kws-v1 in registry. Phase 1 capabilities at `apps/api/src/agents/kws.ts` (or equivalent location TBD).
- `C:\Projects\todoku-prod\` — TD-13 `kws` tenant + 5 templates. Live on Railway.
- `C:\Projects\identiti\` — ID-16 KWS delegation contract Phase 2 (paper). Identiti enters at Scale 2.
- `C:\Projects\kipkiren-pay\` — KP-3/4/5 wired in KWS payments service.

**Master cross-rail tracker:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`.
**Master sprint backlog:** `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\Sprint_Backlog_v1_0.html`.

---

*Kipkiren WS — Build Instruction Pack v1.0 · 4 June 2026 · Confidential · Authored for Chamia Mutuku, Kipkiren Teknolojia · supersedes nothing (initial issue; supersedes ad-hoc README orientation for build-resumption purposes).*
