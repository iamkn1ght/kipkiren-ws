# Chamia Decision Memo — KWS Supabase Region (af-south-1 vs eu-west-1)

**Decision required from:** Chamia Mutuku (CEO & CPO)
**Date drafted:** 4 June 2026
**Decision deadline:** Before KWS S8 production cutover OR before any new Supabase project is provisioned, whichever is sooner
**Author:** Kipkiren WS engineering (Claude) on programme-side synthesis

---

> **RESOLUTION (15 Jun 2026): Option B — eu-west-1.** On inspection, the live KWS Supabase project (`qderqzcyyhnfphrswexm`) and the Railway deploy were **already running in eu-west-1** — the af-south-1 position in the docs never matched the deployed reality. The decision is therefore recorded as Option B and the repo docs reconciled to eu-west-1. **Residual action:** counsel review of the KDPA 2019 §48–49 cross-border-transfer disclosure wording (the client-facing privacy text was corrected from the false "af-south-1 for CBK compliance" claim). Sign-off line at §5 still to be countersigned by Chamia + counsel.

## 0. The decision

Pick **one** of three resolutions for KWS's Supabase region. The conflict is real and cannot be left unresolved beyond S8 entry.

| Source doc | Position | Date |
|---|---|---|
| KWS Reboot Pack v2 §3 + KWS-SEC-014 | **af-south-1 (Cape Town) — mandatory. eu-west-1 prohibited.** CBK rationale. | April 2026 |
| KWS README + RAILWAY.md | af-south-1 required at first deploy | April 2026 |
| Platform Rails Reboot Pack v1.3 §13.4 | **eu-west-1 for all current builds. af-south-1 is aspirational. Do not use af-south-1 for any new build until this changes.** | 23 May 2026 |

The platform-wide standard (v1.3) post-dates and arguably supersedes KWS v2 (April 2026). But KWS has its own KWS-SEC-014 finding referencing CBK requirements that v1.3 doesn't address head-on.

---

## 1. The three resolutions

### Option A — KWS keeps af-south-1 as documented exception

Add KWS to the LipaStack-style explicit-exception list (the only other documented stack exception per Reboot Pack v1.3 §12: LipaStack's AWS-stacked + PCI-DSS L1 exemption).

**Pros:**
- Zero code change. Current build, current Supabase project, current Railway deploy stay as-is.
- KWS-SEC-014 CBK rationale honoured — if there is a genuine CBK-side reason for data residency in Kenya/Africa, this matters and cannot be undone by a platform-standard memo.
- Decoupling from platform region standard means KWS can also use other Cape Town services without rationale churn.

**Cons:**
- af-south-1 is documented as "aspirational" per v1.3 — meaning Supabase's offering there may be less battle-tested than eu-west-1, fewer features, possibly higher outage risk.
- KWS becomes an exception that has to be remembered every time the platform region question comes up. Operationally easy to forget.
- Audit-trail story is divergent — other rails' audit chains are in eu-west-1; KWS's is in af-south-1. Not strictly bad, but a yellow flag at any future ODPC or CBK audit.

### Option B — KWS migrates to eu-west-1

Re-provision Supabase project in eu-west-1 · run migrations 0001–0004 fresh · re-seed · update README + RAILWAY.md + the KWS-SEC-014 finding in kws_architecture_v1.md · bump Reboot Pack v2 to v2.1 noting the change.

**Pros:**
- Aligned with platform standard. One less exception to remember.
- Supabase eu-west-1 is the most battle-tested region for the rest of the platform — every other rail runs there.
- Cross-platform audit-trail story is unified.

**Cons:**
- **Requires KWS-SEC-014 re-examination by counsel before flipping.** If KWS-SEC-014 was raised based on actual CBK Section X requirements, those don't disappear because Reboot Pack v1.3 said so. Need a counsel opinion on whether KWS data falls under any CBK data-residency obligation.
- Data migration: if production has rows, migrate them. Less risky than a hard cutover because KWS is pre-S8 (no real client data yet — only seeded test data).
- ~2-day engineering effort (re-provision, re-deploy, re-test).

### Option C — Stay on af-south-1 for now; flag for Reboot Pack v1.4

No code change today. Document the divergence explicitly. Chamia chooses formally before S8 production cutover (which is the operative deadline since beta clients introduce real data residency stakes).

**Pros:**
- Zero immediate cost.
- Buys time for counsel to weigh in on KWS-SEC-014 properly without rushing a decision.
- Defers the formal decision to a smaller batch with the Reboot Pack v1.4 update.

**Cons:**
- Just defers the decision. The question doesn't get easier with time.
- If KWS-S8 beta clients onboard before Reboot Pack v1.4 lands, real data ends up in af-south-1 and a migration becomes substantively harder (existing client data to migrate, not just dev data).

---

## 2. The forcing functions

1. **KWS-S8 beta-client recruitment** (per Reboot Pack v2 §14 outstanding CEO action). Once a real SME's data lands in KWS, the cost of migration goes up materially. Recommend resolving before recruiting clients.
2. **CBK PSP authorisation for Kipkiren Pay** (separate but adjacent). KP's CBK submission will be examined for the full platform's data-residency picture. KWS divergence may surface as a question.
3. **ODPC registration** (Reboot Pack v2 §14 long-lead). ODPC will ask where personal data is stored. One coherent answer is easier than per-app explanations.
4. **Sprint 9 S9-002 wires Helpan KWS** — adds Helpan AI's own audit-chain into the KWS data picture. Helpan AI is in eu-west-1; KWS's region setting determines whether that's a cross-region read each call.

---

## 3. Recommendation

**Option B — KWS migrates to eu-west-1 — pending fast counsel review on KWS-SEC-014.**

Reasoning:
- The KWS-SEC-014 finding was raised when the platform standard was unspecified. The standard now exists (Reboot Pack v1.3 §13.4) and is unambiguous. The presumption should be alignment.
- Unless counsel confirms there is a **specific, named CBK Section / Regulation / Guidance** mandating Kenya/Africa data residency for KWS-class SME service data, KWS-SEC-014's rationale doesn't survive contact with the platform standard. CBK's data-residency rules apply primarily to payment data (which is in Kipkiren Pay, eu-west-1) and to authorised payment service providers' specific PSP-relevant data — KWS is a SaaS contract-dev front, not a PSP itself.
- Migration is cheap NOW (pre-S8, no real client data) and expensive LATER (post-S8, real SMEs have records).
- Cross-rail Helpan KWS will work better with same-region Supabase reads.

**Tactical action items if Option B is approved:**
- [ ] **Counsel review of KWS-SEC-014** — 1 page from counsel: "Does any CBK / ODPC requirement mandate KWS data residency in Kenya?" Hard deadline: 1 week.
- [ ] If counsel green-lights: provision new Supabase project in eu-west-1; run migrations 0001–0004 + seeds; update Railway env to point at new project; smoke-test full pipeline; verify `/v1/health` green.
- [ ] Update KWS canonical docs: bump Reboot Pack v2 → v2.1 with §3 + KWS-SEC-014 finding updated; update README + RAILWAY.md; update env.example notes.
- [ ] Archive old af-south-1 project once eu-west-1 cutover is live and verified.
- [ ] Update master Reboot Pack v1.3 § (if v1.4 is happening anyway) to note KWS aligned to platform region.

**Tactical action items if Option A is approved instead:**
- [ ] Add KWS to Reboot Pack v1.3 §12 documented-exception list (next to LipaStack's PCI-DSS exemption).
- [ ] Update KWS-SEC-014 finding to explicitly cite the counsel-issued CBK rationale that justifies the exception.
- [ ] Note in master RECAP §1.3 KWS row that KWS is a region exception.
- [ ] Document the operational implications (cross-region reads for Helpan KWS Phase 1 at S9).

**Tactical action items if Option C is approved (defer):**
- [ ] Add a hard gate on S8 recruitment: no beta-client onboarding until this decision lands.
- [ ] Calendar Reboot Pack v1.4 update including this question. Target: before S8 recruitment can plausibly begin.

---

## 4. What happens if the decision drags

- KWS engineering continues on af-south-1 by default (the current build's expectation). 
- S9 work proceeds (it's region-agnostic at the application layer).
- At S8 entry: hard block. Cannot recruit clients without a signed region position.
- Worst case: S8 starts on af-south-1, then later migration required with real client data → harder migration, possible client notification under DPA 2019 if data is moved cross-border.

**Cost of delay = compounds at S8 recruitment. Avoid.**

---

## 5. Sign-off line

Decision: ☐ Option A — Keep af-south-1 as documented exception · ☒ **Option B — eu-west-1 (selected 15 Jun 2026; live system was already there)** · ☐ Option C — Defer with hard S8-recruitment gate

Chamia signature & date: ______________________________________

Counsel confirmation (if Option B): ______________________________________

---

*Chamia Decision Memo — KWS Supabase Region · 4 June 2026 · Confidential · Companion to: KWS INSTRUCTION_PACK.md §3 + Platform Rails Reboot Pack v1.3 §13.4*
