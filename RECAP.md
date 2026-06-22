# Kipkiren WS · RECAP

> Per-app sprint state, deployment state, test counts, blockers. Master cross-rail tracker at `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`.

**App:** Kipkiren WS (Kipkiren Teknolojia subsidiary · `ws.kipkiren.co.ke`)
**Status:** 🟢 S1–S7 substantially shipped · 🟡 S5/S6 CEO actions outstanding · S8 + S9 not started · 🎨 **portal redesign on branch `feat/portal-redesign`** (not yet deployed)
**Repo:** local `C:\Projects\kipkiren_web_services\kws\` · GitHub `iamkn1ght/kipkiren-ws` (renamed from `thhvvv`)
**Latest on main:** `b8a82cd` shipped; `main` is local-ahead by the portal-merge `b85064d` (unpushed). Active work on `feat/portal-redesign` (pushed): unified single portal (role-picker → login → client/admin/task), dark/light theme + toggle, editorial landing page (real plans, de-fabricated), admin **Rails health panel** (`GET /v1/admin/rails`), dev mock-data mode. typecheck clean · 125 api tests pass.
**Deploy note:** the redesign needs a single Cloudflare Pages project pointed at `@kws/portal` (per DEPLOY.md) before go-live; the three old portal apps were merged into `apps/portal`.
**Supabase project:** `qderqzcyyhnfphrswexm` in **eu-west-1** (Ireland) — region decision **RESOLVED to Option B** (see [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md)). The live DB and Railway deploy were already in Europe; docs reconciled 15 Jun 2026. Residual: counsel review of the KDPA §48–49 cross-border-transfer disclosure wording.
**Railway:** service deployed per [RAILWAY.md](./RAILWAY.md)
**Domain:** `ws.kipkiren.co.ke` · client portal `/portal` · admin `/admin` · API `api.ws.kipkiren.co.ke/v1`

---

## Sprint state

| Sprint | Title | Tickets | Status | Notes |
|---|---|---|---|---|
| **S1** | Scaffold, Schema, Auth & RLS | 12 | 🟢 CLOSED | Migrations 0001 + 0002 + 0003 applied; JWT RS256 wired; Supabase RLS on all tables |
| **S2** | Tickets, AI Decomposition, Proformas | 14 | 🟢 CLOSED | `services/decomposition.ts` + `services/proforma.ts` live; Anthropic `claude-sonnet-4-6` integrated; SHA-256 verified |
| **S3** | Proforma Approval & Payments | 12 | 🟢 SUBSTANTIALLY CLOSED | HMAC-verified KP + Paystack webhooks; rate-limited approve. ⏳ KWS-S3-012 live M-Pesa E2E with Chamia's real Safaricom number (CEO); ⏳ RLS-bound integration tests with staging Supabase |
| **S4** | Admin Portal & SLA Monitoring | 10 | 🟢 CLOSED | `services/admin-views.ts` + `services/sla.ts` shipped; admin portal wired (commit `58a4984`). ✅ Kamau **task view** React app built 13 Jun 2026 (`apps/task-view`, port 5174) — My Tasks + Completed, start/complete transitions, PII-safe surface only |
| **S5** | Google Cloud + Microsoft CSP | 8 | 🟡 BLOCKED on CEO actions | GCP Partner Advantage (KWS-S5-001) · Digital Leader cert (KWS-S5-002) · Microsoft CSP via Westcon/Ingram (KWS-S5-003). Then reseller provisioning code. |
| **S6** | Hosting, Domain & Uptime | 8 | 🟡 PARTIAL | `services/uptime.ts` + add-service form shipped (`b8a82cd`). ✅ **Cloudflare DNS adapter** built 15 Jun 2026 (`services/cloudflare.ts` + `routes/dns.ts`, admin-only CRUD, env-gated `requireFeatureEnv('cloudflare')`, live when `CLOUDFLARE_API_TOKEN` set). ⏳ Domain *registration* (registrar — out of scope) · monthly cost real-time on `client_services` (S9 dependency) |
| **S7** | SEO, Social & KDPA | 8 | 🟡 PARTIAL | DSAR + privacy policy + SEO/social display shipped + migration 0004 onboarding consent. ⏳ KWS-S7-005 Privacy Policy legal review (CEO) |
| **S8** | First 5 Clients & Beta Close | 6 | ⚪ NOT STARTED | Recruit 5 beta SMEs (CEO) · SLA audit · AI decomposition accuracy iteration. Mix: 1+ Growth, 1+ Business, 1+ Mwangi P3 |
| **S9** | **Agentic Execution Tier & Scale 1** | 9 | ⚪ MOSTLY NOT STARTED | ✅ **S9-003 Todoku SMS scaffold** built 16 Jun 2026 (`services/notifications.ts` fire-and-forget `sendSms` + `/v1/webhooks/todoku/delivery`, env-gated, placeholder ULIDs → `TEMPLATE_NOT_READY`; live when creds + ULIDs land). ⏳ S9-002 Helpan service role (needs Identiti signing-key spec) · agent_registry · DNS/SSL autonomous scaffold · observability · GCP cost scan. See `kws_sprint_9.md`. |

**Total scope:** 87 tickets across 9 sprints. ~60% shipped · ~25% blocked on CEO actions · ~15% net-new (S9).

---

## Deployment + test state

| Item | Value |
|---|---|
| Local `pnpm install` clean | ✅ |
| `pnpm typecheck` clean | ✅ (re-verified clean 4 Jun 2026) |
| `pnpm lint` clean | ✅ |
| Vitest tests passing | ✅ **102 passed / 5 skipped** across 10 files (run 13 Jun 2026). Covers SLA math, Kamau PII-stripping (incl. `?view=completed`), role-gate, HMAC, billing, decomposition, webhook perimeter, ticket-status, sanitise. `rls-isolation` suite skipped — needs staging Supabase (see CHAMIA-S3-012 / S3 RLS note) |
| Migrations applied | 0001 + 0002 + 0003 + 0004 (current Supabase project) |
| Railway service deployed | per RAILWAY.md |
| `/v1/health` live | ✅ |
| Tier 1 env set | ✅ (boot succeeds) |
| Tier 2 env: Anthropic | ✅ |
| Tier 2 env: Kipkiren Pay sandbox | ✅ (real STK + B2C client adapter — KP-3/4/5 live since 21 May) |
| Tier 2 env: Paystack sandbox | ✅ |
| Tier 2 env: Todoku (S9 dep) | 🟡 Scaffold built (`notifications.ts` + `/v1/webhooks/todoku/delivery`, env-gated). Pending creds + template ULIDs per OPERATOR_REQUEST_TODOKU.md |
| Tier 2 env: Helpan KWS service JWT (S9 dep) | ⚪ Pending OPERATOR_REQUEST_HELPAN.md |

---

## Cross-rail joint status

| Joint | Producer-side | KWS-consumer side |
|---|---|---|
| Helpan H-8c (`helpan-kws-v1` admit + 7 scopes) | ✅ Shipped 21 May 2026 | ⚪ Pending S9-001/002/008 |
| Identiti ID-16 (KWS delegation paper) | ✅ Shipped 22 May 2026 | n/a at MVP — Scale 2 surface |
| Todoku TD-13 (`kws` tenant + 5 templates) | ✅ Shipped 21 May 2026 | ⚪ Pending S9-003 + creds (OPERATOR_REQUEST_TODOKU.md) |
| Kipkiren Pay (KP-3/4/5 + webhooks) | ✅ Live | ✅ Wired via `services/payments.ts` + Tier 2 env |
| Paystack direct | n/a (external) | ✅ Wired |

---

## Outstanding blockers

| ID | Item | Owner | Effect |
|---|---|---|---|
| ~~CHAMIA-REGION~~ | **RESOLVED → eu-west-1 (Option B).** Live DB + Railway already in Europe; docs reconciled 15 Jun 2026 | Chamia | Was blocking S8 cutover — now cleared. Residual: counsel review of KDPA §48–49 disclosure wording (`CHAMIA-S7-005` scope) |
| **CHAMIA-S3-012** | Live M-Pesa E2E with real Safaricom number | Chamia | Closes S3 |
| **CHAMIA-S5-001** | GCP Partner Advantage application | Chamia | Starts S5 external clock (Nairobi region 2026 time-sensitive) |
| **CHAMIA-S5-002** | Google Cloud Digital Leader cert | Chamia | S5 prerequisite |
| **CHAMIA-S5-003** | Microsoft CSP Indirect (Westcon/Ingram) | Chamia | S5 prerequisite |
| **CHAMIA-S7-005** | Privacy Policy legal review | Chamia + counsel | Closes S7 |
| **CHAMIA-S8-001** | Recruit 5 beta SME clients | Chamia | Starts S8 |
| **OPS-TODOKU** | `kws` tenant API key + 5 template ULIDs (TD-13 provisioned 21 May; need handover) | Silvia | Blocks S9-003 |
| **OPS-HELPAN** | `helpan-kws-service` JWT issuance | Silvia | Blocks S9-002 |
| **OPS-ID-16** | Identiti delegation contract activation (paper signed; activation at Scale 2) | Silvia + counsel | Deferred — not blocking S8 or S9 Phase 1 |

---

## Architecture invariants (cannot change without ADR)

| Invariant | Source |
|---|---|
| `proforma_approvals` is INSERT-only — no UPDATE, no DELETE | ADR-KWS-001 + ADR-KWS-002 |
| `audit_log` is INSERT-only | KWS-SEC-012 |
| Kamau has zero client-facing API surface | ADR-KWS-003 |
| Rate card in database, not application config | ADR-KWS-004 |
| M-Pesa via Kipkiren Pay only — never direct Daraja | ADR-KWS-005 |
| JWT RS256 — HS256 prohibited | KWS-SEC-001 |
| Supabase RLS client isolation on all tables | KWS-SEC-002 |
| Match-canonical-UI rule for portals (port verbatim from HTML mockups) | README + repo rule |

---

## Sprint close-out log

_(Populate at every sprint close: date, summary, tests added, migrations applied, deployment confirmation, RECAP §1.3 master tracker updated, Sprint Backlog HTML status cells flipped.)_

| Sprint | Date closed | Tests | Migrations | Deploy | Notes |
|---|---|---|---|---|---|
| S1 | ~ April 2026 | passing | 0001 | initial | — |
| S2 | ~ April 2026 | passing | — | redeploy | Anthropic + decomposition |
| S3 | substantially closed ~ April 2026 | passing | — | redeploy | M-Pesa E2E + RLS tests pending |
| S4 | backend closed ~ April 2026 | passing | — | redeploy | Task view Kamau React UI pending |
| S5 | — | — | — | — | CEO actions blocking |
| S6 | partial ~ late April 2026 | passing | — | redeploy | Domain panel pending |
| S7 | partial ~ late April 2026 | passing | 0004 | redeploy | Legal review pending |
| S8 | — | — | — | — | Not started |
| S9 | — | — | — | — | Not started |

---

## Reference index

- [INSTRUCTION_PACK.md](./INSTRUCTION_PACK.md) — deeper build brief (10 sections)
- [STARTUP_PROMPT.md](./STARTUP_PROMPT.md) — tight session-bootstrap brief
- [README.md](./README.md) — existing repo orientation
- [RAILWAY.md](./RAILWAY.md) — first-deploy click-path
- [OPERATOR_REQUEST_TODOKU.md](./OPERATOR_REQUEST_TODOKU.md) · [OPERATOR_REQUEST_HELPAN.md](./OPERATOR_REQUEST_HELPAN.md)
- [DECISION_REGION_DIVERGENCE.md](./DECISION_REGION_DIVERGENCE.md)
- Canonical docs: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\newdocs\Kipkiren Web Services-Sprint 9-Helpan\` + `newdocs\kipkiren web services - inaugural pack\`
- Master cross-rail RECAP: `C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\RECAP.md`

---

*Kipkiren WS · RECAP v1.3 · 22 June 2026 · Confidential · Update at every sprint close.*
*v1.3 — portal redesign on `feat/portal-redesign`: 3 apps merged into one (`apps/portal`, role-picker → login → portal); dark/light theme + toggle; editorial landing page rebuilt from the brand guide, de-fabricated + real MVP plans; admin Rails health panel (`/v1/admin/rails`); dev mock-data mode; polish pass. typecheck clean, 125 api tests pass. Not deployed — needs Cloudflare Pages project for `@kws/portal` + merge to main. Outstanding (you): rotate the exposed Postgres password, create Supabase Auth users (`dev_users.sql`), privacy-policy counsel review, S5 registrations.*
*v1.1 — reconciled against repo (HEAD `b8a82cd`, working tree has untracked tracker/operator docs): typecheck re-verified clean; test suite run (101 passed / 5 skipped, 10 files); migrations 0001–0004 present; all referenced docs present in repo except `kws_sprint_9.md` (lives in canonical docs folder, not this repo).*
*v1.2 — closed S4: built the Kamau task-view React app (`apps/task-view`, ported verbatim from `kws_task_view.html`, gated to `technical_delivery`). Backend: `GET /v1/tasks?view=completed` + `updated_at` added to the PII-safe surface; `PUT /v1/tickets/:id/status` now stamps `updated_at`. typecheck clean, 102 tests pass, production build OK. **Follow-up (deploy-time, not built):** Cloudflare Pages project for the task-view + add its origin to Railway `ALLOWED_ORIGINS`. Changes not yet committed.*
