# Kipkiren WS · RECAP

> Per-app sprint state, deployment state, test counts, blockers. Master cross-rail tracker at `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`.

**App:** Kipkiren WS (Kipkiren Teknolojia subsidiary · `ws.kipkiren.co.ke`)
**Status:** 🟢 S1-S4 closed · 🟡 S6/S7/S8/S9 partial (codeable tickets shipped 23 Jun; remainder gated on CEO/operator/legal) · 🔴 S5 fully blocked on 3 CEO partnership gates · 🎨 **portal redesign + sprint work on branch `feat/portal-redesign`** (not yet deployed)
**Repo:** local `C:\Projects\kipkiren_web_services\kws\` · GitHub `iamkn1ght/kipkiren-ws` (renamed from `thhvvv`)
**Latest on main:** `b8a82cd` shipped; `main` is local-ahead by the portal-merge `b85064d` (unpushed). Active work on `feat/portal-redesign` (pushed, HEAD `94b2b07`): unified single portal (role-picker → login → client/admin/task), dark/light theme + toggle, editorial landing page, admin **Rails health panel** (`GET /v1/admin/rails`), dev mock-data mode. **HEAD now `296b135`** after the codeable-sprint pass (S6-003/005, S8-003/004, S9-001/004/006 - see v1.5 note). **Landing overhaul (Jun 2026):** repo-wide AI-marker sweep (em/en-dash, smart quotes, ellipsis → ASCII); de-fabricated chrome (removed fake telemetry/lighthouse/version numbers/dead links/fake contact); copy re-aimed studio→SME (service cards, "what you get", proforma-centred process); true-black dark / true-white light; dark brand favicon (SVG); nav polish (bigger/bolder mark + headings, animated underline hover, solid pill sign-in, wider 1320px container, status bar removed); **self-typing AI proforma terminal** + scroll-reveal. typecheck clean · 125 api tests pass.
**Deploy note:** the redesign needs a single Cloudflare Pages project pointed at `@kws/portal` (per DEPLOY.md) before go-live; the three old portal apps were merged into `apps/portal`.
**Supabase project:** `qderqzcyyhnfphrswexm` in **eu-west-1** (Ireland) - region decision **RESOLVED to Option B** (see [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md)). The live DB and Railway deploy were already in Europe; docs reconciled 15 Jun 2026. Residual: counsel review of the KDPA §48-49 cross-border-transfer disclosure wording.
**Railway:** service deployed per [RAILWAY.md](./RAILWAY.md)
**Domain:** `ws.kipkiren.co.ke` · client portal `/portal` · admin `/admin` · API `api.ws.kipkiren.co.ke/v1`

---

## Sprint state

| Sprint | Title | Tickets | Status | Notes |
|---|---|---|---|---|
| **S1** | Scaffold, Schema, Auth & RLS | 12 | 🟢 CLOSED | Migrations 0001 + 0002 + 0003 applied; JWT RS256 wired; Supabase RLS on all tables |
| **S2** | Tickets, AI Decomposition, Proformas | 14 | 🟢 CLOSED | `services/decomposition.ts` + `services/proforma.ts` live; Anthropic `claude-sonnet-4-6` integrated; SHA-256 verified |
| **S3** | Proforma Approval & Payments | 12 | 🟢 SUBSTANTIALLY CLOSED | HMAC-verified KP + Paystack webhooks; rate-limited approve. ⏳ KWS-S3-012 live M-Pesa E2E with Chamia's real Safaricom number (CEO); ⏳ RLS-bound integration tests with staging Supabase |
| **S4** | Admin Portal & SLA Monitoring | 10 | 🟢 CLOSED | `services/admin-views.ts` + `services/sla.ts` shipped; admin portal wired (commit `58a4984`). ✅ Kamau **task view** React app built 13 Jun 2026 (`apps/task-view`, port 5174) - My Tasks + Completed, start/complete transitions, PII-safe surface only |
| **S5** | Google Cloud + Microsoft CSP | 8 | 🟡 BLOCKED on CEO actions | GCP Partner Advantage (KWS-S5-001) · Digital Leader cert (KWS-S5-002) · Microsoft CSP via Westcon/Ingram (KWS-S5-003). Then reseller provisioning code. |
| **S6** | Hosting, Domain & Uptime | 8 | 🟡 PARTIAL | `services/uptime.ts` + add-service form (`b8a82cd`) + **Cloudflare DNS adapter** (15 Jun). ✅ **S6-003 SSL cert tracking** (23 Jun: migration 0005, `services/ssl.ts` `classifySslState` + `runSslChecks`, `POST /v1/admin/ssl-check`). ✅ **S6-005 domain-expiry alerts** (`services/domain-expiry.ts` `dueExpiryAlerts` + `POST /v1/admin/domain-expiry-scan`; Todoku SMS gated). ⏳ Domain *registration* (registrar - out of scope) · admin service-mgmt UI (needs canonical mockup) |
| **S7** | SEO, Social & KDPA | 8 | 🟡 PARTIAL (7/8) | DSAR + privacy policy + SEO/social display shipped + migration 0004 onboarding consent. ⏳ KWS-S7-005 Privacy Policy legal review (CEO + counsel) - only open item |
| **S8** | First 5 Clients & Beta Close | 6 | 🟡 PARTIAL | ✅ **S8-003 SLA audit** (23 Jun: `computeSlaAudit` + `GET /v1/admin/sla-audit`). ✅ **S8-004 AI-decomposition accuracy harness** (`services/decomposition-eval.ts` + labelled-corpus test asserting macro-F1 ≥ 0.85 = S9 Phase-1 gate). ⏳ Recruit 5 beta SMEs + SLA acceptance gate (CEO) · live M-Pesa E2E (S3 tail). |
| **S9** | **Agentic Execution Tier & Scale 1** | 9 | 🟡 IN PROGRESS | ✅ **S9-003 Todoku SMS scaffold** (16 Jun). ✅ **S9-001 agent_registry** (23 Jun: migration 0006 + RLS + `helpan-kws-v1` seed + `GET /v1/admin/agents`). ✅ **S9-004 agent-execution ledger/guard scaffold** (migration 0007 `agent_executions` append-only + `assertExecutionPreconditions` + `AGENT_DNS_EXECUTION_ENABLED` flag off). ✅ **S9-006 observability foundation** (`services/observability.ts` baseline + anomaly detection + `GET /v1/admin/site-health`). ⏳ S9-002 Helpan service JWT (operator) · S9-005 SSL autonomous exec (depends S9-004 + live caller) · S9-007 GCP cost (depends S5 partnership) · S9-008 Helpan Phase 1 (depends S9-002). See `kws_sprint_9.md`. |

**Total scope:** 87 tickets across 9 sprints. ~60% shipped · ~25% blocked on CEO actions · ~15% net-new (S9).

---

## Deployment + test state

| Item | Value |
|---|---|
| Local `pnpm install` clean | ✅ |
| `pnpm typecheck` clean | ✅ (re-verified 23 Jun 2026; also fixed a latent `exactOptionalPropertyTypes` error in `rails.ts`) |
| `pnpm lint` clean | ✅ |
| Vitest tests passing | ✅ **167 passed / 5 skipped** across 20 files (run 23 Jun 2026). Adds SLA-audit, decomposition-accuracy (macro-F1 gate), SSL classification, domain-expiry banding, agent-execution guard, observability baseline/anomaly, and role-gate coverage for the 5 new admin endpoints. `rls-isolation` skipped - needs staging Supabase |
| Migrations applied | 0001 + 0002 + 0003 + 0004 (current Supabase project). **0005-0007 authored 23 Jun, NOT yet applied** (need a DB connection): 0005 SSL columns on `client_services`, 0006 `agent_registry` (+ `helpan-kws-v1` seed), 0007 `agent_executions` ledger |
| Railway service deployed | per RAILWAY.md |
| `/v1/health` live | ✅ |
| Tier 1 env set | ✅ (boot succeeds) |
| Tier 2 env: Anthropic | ✅ |
| Tier 2 env: Kipkiren Pay sandbox | ✅ (real STK + B2C client adapter - KP-3/4/5 live since 21 May) |
| Tier 2 env: Paystack sandbox | ✅ |
| Tier 2 env: Todoku (S9 dep) | 🟡 Scaffold built (`notifications.ts` + `/v1/webhooks/todoku/delivery`, env-gated). Pending creds + template ULIDs per OPERATOR_REQUEST_TODOKU.md |
| Tier 2 env: Helpan KWS service JWT (S9 dep) | ⚪ Pending OPERATOR_REQUEST_HELPAN.md |

---

## Cross-rail joint status

| Joint | Producer-side | KWS-consumer side |
|---|---|---|
| Helpan H-8c (`helpan-kws-v1` admit + 7 scopes) | ✅ Shipped 21 May 2026 | ⚪ Pending S9-001/002/008 |
| Identiti ID-16 (KWS delegation paper) | ✅ Shipped 22 May 2026 | n/a at MVP - Scale 2 surface |
| Todoku TD-13 (`kws` tenant + 5 templates) | ✅ Shipped 21 May 2026 | ⚪ Pending S9-003 + creds (OPERATOR_REQUEST_TODOKU.md) |
| Kipkiren Pay (KP-3/4/5 + webhooks) | ✅ Live | ✅ Wired via `services/payments.ts` + Tier 2 env |
| Paystack direct | n/a (external) | ✅ Wired |

---

## Outstanding blockers

| ID | Item | Owner | Effect |
|---|---|---|---|
| ~~CHAMIA-REGION~~ | **RESOLVED → eu-west-1 (Option B).** Live DB + Railway already in Europe; docs reconciled 15 Jun 2026 | Chamia | Was blocking S8 cutover - now cleared. Residual: counsel review of KDPA §48-49 disclosure wording (`CHAMIA-S7-005` scope) |
| **CHAMIA-S3-012** | Live M-Pesa E2E with real Safaricom number | Chamia | Closes S3 |
| **CHAMIA-S5-001** | GCP Partner Advantage application | Chamia | Starts S5 external clock (Nairobi region 2026 time-sensitive) |
| **CHAMIA-S5-002** | Google Cloud Digital Leader cert | Chamia | S5 prerequisite |
| **CHAMIA-S5-003** | Microsoft CSP Indirect (Westcon/Ingram) | Chamia | S5 prerequisite |
| **CHAMIA-S7-005** | Privacy Policy legal review | Chamia + counsel | Closes S7 |
| **CHAMIA-S8-001** | Recruit 5 beta SME clients | Chamia | Starts S8 |
| **OPS-TODOKU** | `kws` tenant API key + 5 template ULIDs (TD-13 provisioned 21 May; need handover) | Silvia | Blocks S9-003 |
| **OPS-HELPAN** | `helpan-kws-service` JWT issuance | Silvia | Blocks S9-002 |
| **OPS-ID-16** | Identiti delegation contract activation (paper signed; activation at Scale 2) | Silvia + counsel | Deferred - not blocking S8 or S9 Phase 1 |

---

## Architecture invariants (cannot change without ADR)

| Invariant | Source |
|---|---|
| `proforma_approvals` is INSERT-only - no UPDATE, no DELETE | ADR-KWS-001 + ADR-KWS-002 |
| `audit_log` is INSERT-only | KWS-SEC-012 |
| Kamau has zero client-facing API surface | ADR-KWS-003 |
| Rate card in database, not application config | ADR-KWS-004 |
| M-Pesa via Kipkiren Pay only - never direct Daraja | ADR-KWS-005 |
| JWT RS256 - HS256 prohibited | KWS-SEC-001 |
| Supabase RLS client isolation on all tables | KWS-SEC-002 |
| Match-canonical-UI rule for portals (port verbatim from HTML mockups) | README + repo rule |

---

## Sprint close-out log

_(Populate at every sprint close: date, summary, tests added, migrations applied, deployment confirmation, RECAP §1.3 master tracker updated, Sprint Backlog HTML status cells flipped.)_

| Sprint | Date closed | Tests | Migrations | Deploy | Notes |
|---|---|---|---|---|---|
| S1 | ~ April 2026 | passing | 0001 | initial | - |
| S2 | ~ April 2026 | passing | - | redeploy | Anthropic + decomposition |
| S3 | substantially closed ~ April 2026 | passing | - | redeploy | M-Pesa E2E + RLS tests pending |
| S4 | backend closed ~ April 2026 | passing | - | redeploy | Task view Kamau React UI pending |
| S5 | - | - | - | - | CEO actions blocking |
| S6 | partial ~ late April 2026 | passing | - | redeploy | Domain panel pending |
| S7 | partial ~ late April 2026 | passing | 0004 | redeploy | Legal review pending |
| S8 | - | - | - | - | Not started |
| S9 | - | - | - | - | Not started |

---

## Reference index

- [INSTRUCTION_PACK.md](./INSTRUCTION_PACK.md) - deeper build brief (10 sections)
- [STARTUP_PROMPT.md](./STARTUP_PROMPT.md) - tight session-bootstrap brief
- [README.md](./README.md) - existing repo orientation
- [RAILWAY.md](./RAILWAY.md) - first-deploy click-path
- [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md) · [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md)
- [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md)
- Canonical docs: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\` + `newdocs\kipkiren web services - inaugural pack\`
- Master cross-rail RECAP: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`

---

*Kipkiren WS · RECAP v1.6 · 23 June 2026 · Confidential · Update at every sprint close.*
*v1.6 - admin-portal surfacing for the sprint backend. New **Health tab** (S9-006 site-health: per-site uptime/p95/anomaly + S9-001 agent registry) and an **SLA audit panel** in the Capacity tab (S8-003 compliance % + worst-breach clients). Wired through `useAdminData` with mock-data fallback for the dev preview. The site-health/agents fetches depend on migrations 0005-0007 so they are wrapped in `.catch` (degrade to empty, never break the admin load); the SLA-audit fetch reads only existing tables so it works today. Portal typecheck + build clean. Deferred until migrations land (would break working endpoints otherwise): SSL state on the Services tab, and the uptime/SSL/domain-expiry "run scan" buttons. Supabase MCP still connected to the wrong org (`ssevliwftzaeysntnovb`) - `qderqzcyyhnfphrswexm` not reachable, so 0005-0007 remain unapplied. HEAD `325c6b2`+.*
*v1.5 - codeable-sprint pass on `feat/portal-redesign`. After a 7-agent map of every sprint ticket vs repo + canonical specs, shipped the in-repo-codeable, unblocked tickets (everything else is gated on CEO/operator/legal/live-credential actions): **S8-003** SLA audit (`GET /v1/admin/sla-audit`), **S8-004** AI-decomposition accuracy harness (macro-F1 ≥ 0.85 = S9 Phase-1 gate), **S6-003** SSL cert tracking (migration 0005 + `POST /ssl-check`), **S6-005** domain-expiry alerts (`POST /domain-expiry-scan`, Todoku send gated), **S9-001** agent_registry (migration 0006 + seed + `GET /agents`), **S9-004** agent-execution ledger + guard scaffold (migration 0007 + `AGENT_DNS_EXECUTION_ENABLED` off), **S9-006** observability foundation (`GET /site-health`). Also fixed a latent `rails.ts` typecheck error. typecheck clean; 167 tests pass / 5 skipped. Migrations 0005-0007 authored but NOT applied (no DB connection). Still blocked (no code possible): S5 (3 GCP/MS partnership gates), S3-012/S8-001/002/005 (Chamia: live Safaricom + client recruitment), S7-005 (counsel), S9-002/008 (Silvia: Helpan JWT), S9-007 (depends S5). Commits 5f6b63f, 70caa09, 12b31b3, 296b135.*
*v1.4 - landing-page overhaul on `feat/portal-redesign` (HEAD `94b2b07`). Repo-wide AI typographic-marker sweep to ASCII (567 em-dashes + en-dashes + smart quotes + ellipses across 78 files; typecheck clean, 125 tests pass). Landing de-fabricated after an honest UX review: removed invented status-bar telemetry, lighthouse-100s, package version numbers, the fake "Amara Njoroge" contact data, dead footer links and the fabricated company number. Copy re-aimed from boutique studio → SME managed-services: service cards (site/host/grow/cloud), §02 "what you get" (benefits-first, stack table demoted to a technical reference), proforma-centred process, plain-language studio section. Visual: true-black dark / true-white light, dark brand favicon (`public/favicon.svg`), larger/bolder nav mark + headings with animated underline-on-hover, solid pill sign-in (ink-on-light / white-on-dark), 1320px container, top status bar removed, self-typing **AI proforma terminal** (`ProformaTerminal.tsx`) + IntersectionObserver scroll-reveal. Still not deployed - same go-live checklist as v1.3.*
*v1.3 - portal redesign on `feat/portal-redesign`: 3 apps merged into one (`apps/portal`, role-picker → login → portal); dark/light theme + toggle; editorial landing page rebuilt from the brand guide, de-fabricated + real MVP plans; admin Rails health panel (`/v1/admin/rails`); dev mock-data mode; polish pass. typecheck clean, 125 api tests pass. Not deployed - needs Cloudflare Pages project for `@kws/portal` + merge to main. Outstanding (you): rotate the exposed Postgres password, create Supabase Auth users (`dev_users.sql`), privacy-policy counsel review, S5 registrations.*
*v1.1 - reconciled against repo (HEAD `b8a82cd`, working tree has untracked tracker/operator docs): typecheck re-verified clean; test suite run (101 passed / 5 skipped, 10 files); migrations 0001-0004 present; all referenced docs present in repo except `kws_sprint_9.md` (lives in canonical docs folder, not this repo).*
*v1.2 - closed S4: built the Kamau task-view React app (`apps/task-view`, ported verbatim from `kws_task_view.html`, gated to `technical_delivery`). Backend: `GET /v1/tasks?view=completed` + `updated_at` added to the PII-safe surface; `PUT /v1/tickets/:id/status` now stamps `updated_at`. typecheck clean, 102 tests pass, production build OK. **Follow-up (deploy-time, not built):** Cloudflare Pages project for the task-view + add its origin to Railway `ALLOWED_ORIGINS`. Changes not yet committed.*
