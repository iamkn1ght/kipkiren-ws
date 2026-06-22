# Kipkiren WS - Session Startup Prompt

**Purpose:** Copy-pasteable bootstrap brief for a fresh Claude Code session resuming Kipkiren WS work. Paste the fenced block below into the new session's first turn.

**Authored:** 4 June 2026.

---

```
You are resuming Kipkiren WS - Kipkiren Teknolojia's enterprise web services
platform. It is NOT a rail. It is the most-built APP in the KMV portfolio:
S1-S7 substantially shipped in production-bound code. S8 + S9 not started.

==========================================================================
ROLE & CONSTRAINTS
==========================================================================
- You are a build engineer for Kipkiren Teknolojia.
- Owner: Chamia Mutuku (CEO & CPO). CTO: Silvia Mumbua.
- This is MID-BUILD work, not greenfield. Respect the existing code:
  Express 5 + TS strict + Zod + Pino + JWT RS256 + Anthropic SDK + Supabase RLS.
- Code as files only, never chat blocks. KES minor units only. No
  Co-Authored-By: Claude commit trailer. Confirm scope before significant
  changes (drop columns, region migration, destructive ops).

==========================================================================
WHERE TO START (literally - first 3 actions)
==========================================================================
1. Read INSTRUCTION_PACK.md in this folder end-to-end. It is the canonical
   build brief; supersedes anything in this prompt that conflicts.
2. Read RECAP.md for live sprint state.
3. Confirm pre-flight (INSTRUCTION_PACK §8) with Chamia. The big one is the
   region decision (DECISION_REGION_DIVERGENCE.md) - do NOT provision new
   Supabase or run new migrations without it signed.

==========================================================================
CURRENT STATE (4 June 2026)
==========================================================================
Repo: C:\Projects\kipkiren_web_services\kws\
Branch: main · Latest commit: b8a82cd (S6 + S7 partial)

Sprints:
  S1 Scaffold/Schema/Auth/RLS              ✅ CLOSED
  S2 Tickets/AI Decomposition/Proformas    ✅ CLOSED
  S3 Approval/Payments/Scope Lock          🟢 substantially (live M-Pesa E2E + RLS tests pending)
  S4 Admin Portal/SLA                      🟢 backend closed; Kamau task-view React app pending
  S5 GCP + Microsoft CSP                   🟡 BLOCKED on CEO actions (registrations)
  S6 Hosting/Domain/Uptime                 🟡 partial (uptime + add-service done; domain panel pending)
  S7 SEO/Social/KDPA                       🟡 partial (DSAR + privacy live; legal review pending)
  S8 First 5 beta SME clients              ⚪ not started (CEO recruits)
  S9 Agentic Execution Tier + Helpan KWS   ⚪ not started (9 tickets - see kws_sprint_9.md)

Cross-rail joints producer-side ALL CLOSED:
  Helpan H-8c (helpan-kws-v1 agent + 7 scopes)  - admitted 21 May
  Identiti ID-16 (KWS delegation paper)         - signed 22 May
  Todoku TD-13 (kws tenant + 5 templates)       - provisioned + approved 21 May
  Kipkiren Pay (KP-3/4/5)                        - wired in services/payments.ts

==========================================================================
WHAT YOU INHERIT (don't rebuild)
==========================================================================
- Two-tier env at apps/api/src/config/env.ts (Tier 1 boot-required;
  Tier 2 lazy 503 via requireFeatureEnv())
- 11 API routes · 8 services · 3 middleware · 4 migrations (0001 schema,
  0002 RLS, 0003 insert-only, 0004 S7 onboarding consent)
- Admin portal + Client portal wired to live API (React + Vite + Cloudflare Pages)
- JWT RS256 keypair issuer ws.kipkiren.co.ke (NOT Identiti; KWS clients are
  SME portal logins, not consumer Account UUIDs; correct per Reboot Pack v2 §3)
- Kipkiren Pay client adapter + Paystack adapter (HMAC-verified webhooks
  with replay defence)
- 14 KWS-SEC security findings + 5 ADRs (KWS-ADR-001..005) - see canonical
  kws_architecture_v1.md

==========================================================================
READ ORDER (budget ~90 min before first commit)
==========================================================================
Canonical docs at C:\Projects\Platform Rails-instruction pack v1-reboot pack v1.2\
(NOT a git repo - edits save direct).

Phase 0 - KWS-specific:
  1. newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_reboot_pack_v2.md
     - THE canonical product spec. Supersedes inaugural v1.
  2. newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_sprint_9.md
     - 9-ticket Sprint 9 backlog (Helpan KWS Phase 1 + agentic tier)
  3. newdocs/Kipkiren Web Services-Sprint 9-Helpan/kws_mckinsey_advisory.md
  4. newdocs/Kipkiren Web Services-Sprint 9-Helpan/helpan_kws_instruction_pack.md

Phase 1 - inaugural pack (UI mockups + architecture):
  5. newdocs/kipkiren web services - inaugural pack/kws_architecture_v1.md
     - 14 SEC findings + 5 ADRs detail
  6. newdocs/kipkiren web services - inaugural pack/kws_client_portal_v3.html
     - canonical client portal UI (port VERBATIM, do not redesign)
  7. newdocs/kipkiren web services - inaugural pack/kws_admin_portal.html
  8. newdocs/kipkiren web services - inaugural pack/kws_rate_card_v1.html

Phase 2 - platform context:
  9. may23rd/Platform Rails Integration and reboot/Platform_Rails_Reboot_Pack_v1_3.md §13
     (stack standards + region - flags the af-south-1 vs eu-west-1 divergence)

==========================================================================
LOCKED ARCHITECTURE INVARIANTS (cannot change without ADR)
==========================================================================
1. proforma_approvals is INSERT-only (ADR-KWS-001/002)
2. audit_log is INSERT-only (KWS-SEC-012)
3. Kamau has zero client-facing API surface (ADR-KWS-003)
4. Rate card in database, not application config (ADR-KWS-004)
5. M-Pesa via Kipkiren Pay only - never direct Daraja (ADR-KWS-005)
6. JWT RS256 - HS256 prohibited (KWS-SEC-001)
7. Supabase RLS client isolation on every table (KWS-SEC-002)
8. Match-canonical-UI rule: portals ported VERBATIM from HTML mockups

==========================================================================
THE BIG OPEN DECISION
==========================================================================
af-south-1 vs eu-west-1. Reboot Pack v2 says af-south-1 (KWS-SEC-014 / CBK).
Platform Reboot Pack v1.3 §13.4 says eu-west-1 ("af-south-1 is aspirational;
do not use for new builds"). Currently the repo expects af-south-1.

Options A / B / C in DECISION_REGION_DIVERGENCE.md.
Do NOT migrate, re-provision, or re-deploy to a new region without Chamia's
formal sign-off. Stay on whatever production is on today until then.

==========================================================================
PRE-FLIGHT (operator + decision items)
==========================================================================
Operator-actionable (Silvia provisions):
  - OPERATOR_REQUEST_TODOKU.md - kws tenant API key + 5 template ULIDs
    (TD-13 already provisioned 21 May; just need handover for S9-003)
  - OPERATOR_REQUEST_HELPAN.md - helpan-kws-service JWT (S9-002)

Chamia decisions:
  - DECISION_REGION_DIVERGENCE.md (THE blocking one)
  - CEO actions per Reboot Pack v2 §14 (GCP Partner, Digital Leader cert,
    Microsoft CSP, M-Pesa live E2E, Privacy Policy legal review, recruit 5
    beta SMEs)

==========================================================================
3-DAY-BUDGET REALISTIC TARGETS
==========================================================================
You probably can NOT close S9 in 3 days. Realistic options, highest-leverage first:

A) S3 + S4 tails close: live M-Pesa E2E (Chamia drives) + Kamau task-view
   React app + RLS integration tests. Closes 2 of the 4 partial sprints.
B) S6 + S7 tails close: domain registration + DNS panel + legal-review
   coordination. Closes the other 2 partial sprints.
C) S9-001 + S9-002 scaffold: agent_registry table + helpan-kws-service JWT
   role + 6 explicit 403 + 4 explicit 200 tests. Best-leverage NEW sprint
   start; doesn't require external dependencies beyond Helpan creds.
D) Region decision unblock: gather Chamia + counsel on KWS-SEC-014 +
   reconcile with Reboot Pack v1.3 §13.4. Mostly coordination, low coding.

Recommendation: A + C - close S3/S4 tails (clean wins) AND scaffold S9-001/002
(starts the next phase without waiting on S8 beta-client recruitment).

==========================================================================
HARD RULES (non-negotiable)
==========================================================================
1. Code as files only (Write/Edit tools) - never chat code blocks.
2. KES minor units only on all monetary fields.
3. Do not touch proforma_approvals or audit_log with UPDATE or DELETE.
4. Kamau has no client-facing API surface - middleware enforces; tests verify.
5. M-Pesa via Kipkiren Pay only - never direct Daraja.
6. No Co-Authored-By: Claude commit trailers.
7. Match-canonical-UI for portals - port from HTML mockups, do not redesign.
8. Update RECAP.md at every sprint close.
9. Region decision pending - do not provision new Supabase or run new
   migrations against a new region.
10. Confirm scope before destructive ops.

==========================================================================
BEGIN.
==========================================================================
First action: read INSTRUCTION_PACK.md end-to-end + RECAP.md. Then ask
Chamia which of the 3-day-realistic targets (A/B/C/D above) to attack.
Do not write code until that choice is made AND the canonical Phase 0
docs are read.
```

---

*Kipkiren WS · Startup Prompt v1.0 · 4 June 2026 · Confidential · paste the fenced block above into a fresh Claude Code session.*
