# Client Onboarding and Authentication (KWS-S8-001)

How a business becomes a signed-in client of Kipkiren Web Services, and how the
system keeps that provisioning correct, auditable, and safe to run hundreds of
times.

This replaces the old manual path (open the Supabase dashboard, run SQL to make
a client, hand-create an auth user, hope the two stay linked). An admin now runs
the whole thing from inside the portal with one "Add client" action.

---

## 1. What gets created

One onboarding creates three linked records across two systems:

| # | Record | System | Purpose |
|---|--------|--------|---------|
| 1 | `public.clients` | app DB | the business (name, contact, phone, retainer plan, status) |
| 2 | `auth.users` | Supabase Auth | the login identity, created as an INVITE. The client sets their own password from the invite email. We never see or store it. |
| 3 | `public.users` | app DB | the app profile: `id` = the auth user id, `role = client`, `client_id` linked to record 1. The login flow reads this to mint the JWT. |

The three must all exist and stay linked, or the account is broken:

- client without auth user  -> a business no one can sign in to
- auth user without profile -> a login that resolves to no role and 401s
- profile pointing at a missing client -> a signed-in user with no data

There is no cross-service database transaction available (Supabase Auth lives in
a separate schema, and the JS client is not a single connection we can `BEGIN`),
so we cannot wrap all three writes in one commit. Correctness is enforced with a
**saga plus compensation** instead.

---

## 2. Architecture

```
Admin portal (AdminClients.tsx)
      |  POST /v1/admin/clients   (admin JWT + provisioning rate limit)
      v
routes/admin.ts
      |  validate (OnboardClientInput) -> runOnboarding(input, actor, store)
      v
services/client-onboarding.ts
      runOnboarding()  = the saga (pure orchestration, no Supabase)
      supabaseStore()  = production wiring (Supabase service role + Auth admin)
```

The saga is deliberately split from its side effects:

- `runOnboarding(input, actor, store)` is **pure orchestration** over an
  injectable `OnboardingStore` interface. It knows the order of steps and the
  rollback rules and nothing else.
- `supabaseStore()` is the **only** place that touches Supabase. It implements
  the same interface with real service-role calls.

Because the saga takes the store as an argument, every branch (happy path and
each rollback) is unit-tested with a fake store, with no network and no
database. See `apps/api/test/client-onboarding.test.ts`.

---

## 2b. Two ways a client account is created

There are two front doors onto the exact same saga+compensation core:

| Path | Who runs it | Auth step | Password | Route |
|------|-------------|-----------|----------|-------|
| **Admin onboarding** (S8-001) | an admin | Supabase `inviteUserByEmail` | client sets it later from the invite email | `POST /v1/admin/clients` (admin-only) |
| **Self-service signup** (S8-002) | the client, publicly | Supabase `admin.createUser` with `email_confirm: true` | client sets it inline at signup | `POST /v1/auth/signup` (public) |

Self-service exists so onboarding scales without an admin hand-provisioning every
client. `runSelfSignup` shares `createClient` / `upsertProfile` / rollback with the
admin saga; the only differences are the auth step (a password user instead of an
invite) and that `role = client` / `status = active` are **fixed server-side and
cannot be set from the request body**. On success the signup route issues our own
session immediately, so the new client lands straight in the portal.

Security specifics for the public path:
- **Strict per-IP rate limit** (`signupRateLimit`, 10/hour) - it is unauthenticated
  and creates an auth user + a client row per call.
- **Anti-hijack**: an email already owned by a client (or already registered in
  Supabase Auth) is rejected with 409, never linked.
- **No privilege escalation**: `SelfSignupInput` has no `role`/`status` field; extra
  keys are dropped by Zod.
- **Known tradeoff**: `email_confirm: true` marks the address usable without proving
  ownership (we mint our own JWT and do not depend on Supabase's throttled
  confirmation email). Nothing is charged at signup - the proforma is still the real
  gate - so the blast radius of a junk signup is one rate-limited client row. When
  custom SMTP / `EMAIL_*` is provisioned, flip this to a real verification step
  (`TODO(KWS-S8-002)` in `createPasswordUser`).

## 3. Authentication flow (how a client actually signs in)

KWS does not use Supabase sessions. Supabase Auth is used only to store and
verify the password; the API mints its own RS256 JWT and manages its own
rotating refresh tokens.

1. Client opens the invite email and sets a password (Supabase Auth stores the
   Argon2 hash; we never receive it).
2. Client signs in at the portal: `POST /v1/auth/login` with email + password.
3. The API calls `supabase.auth.signInWithPassword` **only to verify the
   password**, then discards that Supabase session immediately.
4. The API loads `public.users` for that auth id to get `role` and `client_id`,
   and mints its own short-lived access token (RS256) plus a rotating refresh
   token.
5. Refresh tokens: hashed at rest, delivered as an httpOnly + secure +
   sameSite=strict cookie scoped to `/v1/auth`, rotated on every refresh with
   replay detection (a reused token burns the whole token family). See
   `routes/auth.ts`.

Login is rate-limited (`loginRateLimit`) and audited both ways:
`auth_login_succeeded` and `auth_login_failed` (the failed event records the
email and IP so brute force is visible). Failed logins always return a generic
`invalid_credentials` so the response never reveals whether an email exists.

The role model today is one role per user, taken from the JWT. The real JWT role
is always authoritative; the client cannot elevate itself.

---

## 4. Provisioning flow (the saga, step by step)

`runOnboarding` in `services/client-onboarding.ts`:

```
0. Idempotency:  findClientByEmail(email)  -> 409 client_email_exists if present
0. Validate plan: findPlan(plan_id)        -> 400 invalid_plan if missing

1. createClient(...)                        -> public.clients row  [record 1]

2. inviteUser(email, {full_name, client_id, redirectTo})
      ok    -> {userId, created:true}       -> auth.users invite   [record 2]
      email already has an identity
            -> resolve it, {userId, created:false}   (link, do not dead-end)
      hard fail
            -> ROLLBACK record 1, throw 502 invite_failed

3. upsertProfile({id:userId, email, full_name, client_id})  [record 3]
      fail  -> ROLLBACK record 1
            -> if we created the auth user (created:true), ROLLBACK record 2
            -> throw 500 profile_link_failed

4. audit(client_onboarded)
5. return { client, plan_name, invite_status }
```

Idempotency: one client per email. Because a failed run rolls its partial record
back, a retry with the same email is safe rather than piling up orphans.

Everything before the first write (idempotency + plan check) happens up front so
the common bad inputs never create anything at all.

---

## 5. Failure handling and rollback (compensation)

Each step that created something registers how to undo it, and any later failure
runs those compensations in reverse before throwing:

| Fails at | Compensation | HTTP | Result |
|----------|--------------|------|--------|
| create client | none needed | 500 | nothing created |
| invite | delete the client | 502 `invite_failed` | nothing left behind |
| profile link (invite created a new auth user) | delete client + delete auth user | 500 `profile_link_failed` | nothing left behind |
| profile link (invite linked a pre-existing auth user) | delete client only | 500 `profile_link_failed` | the pre-existing user is untouched |

The last row matters: the saga only ever deletes what it created. If the email
already belonged to an auth user, that user is linked (not recreated) and is
never deleted during rollback.

Compensations run through `safeCompensate`, which logs but swallows its own
errors so a failing rollback can never mask the original cause. If a
compensation itself fails (rare), it is logged as `onboard_compensation_failed`
for manual cleanup rather than crashing the request.

Every user-facing failure message states that no records were created, so the
admin can simply retry.

---

## 6. API surface

All under `/v1/admin`, all requiring auth. Provisioning writes are admin-only and
carry the provisioning rate limit (`provisioningRateLimit`: 60 requests per hour,
keyed by admin id, falling back to IP).

| Method | Path | Role | What |
|--------|------|------|------|
| POST | `/v1/auth/signup` | **public** | self-service client signup (S8-002); rate-limited, auto-issues a session |
| GET  | `/v1/auth/plans` | **public** | retainer plans for the signup form (read-only) |
| GET  | `/clients` | delivery_lead, admin | list with invite status attached |
| GET  | `/retainer-plans` | delivery_lead, admin | active plans for the form |
| POST | `/clients` | admin | run the onboarding saga (201) |
| PATCH| `/clients/:id` | delivery_lead, admin | edit business details |
| POST | `/clients/:id/status` | admin | active / suspended |
| POST | `/clients/:id/resend-invite` | admin | resend the invite email |
| POST | `/clients/:id/reset-password` | admin | send a password reset email |

Lifecycle operations (status, resend, reset, edit) are single-step and each
writes its own audit event: `client_onboarded`, `client_updated`,
`client_status_changed`, `client_invite_resent`, `client_password_reset_sent`.

### Invite status

The clients list is enriched with an auth-derived status per client
(`attachInviteStatus`), computed from `public.users` -> Supabase Auth:

- `invited`  - invite sent, not yet accepted
- `accepted` - password set (email confirmed) but never signed in
- `active`   - has signed in at least once
- `unknown`  - enrichment failed; the list still renders (degrades, never breaks)

---

## 7. Security posture

- **Least privilege by role.** Reads are open to delivery leads; every write that
  touches auth (onboard, status, invite, reset) is admin-only, enforced by
  `requireRole('admin')` at the route.
- **No password ever exposed.** The client sets their own password via the invite
  flow. KWS never receives, logs, or stores a client password.
- **Validation at the edge.** `OnboardClientInput` / `UpdateClientInput` (Zod)
  normalise and bound every field (email lowercased and format-checked, lengths
  capped, empty optional fields coerced to undefined) before any write.
- **Rate limiting.** Login is throttled; provisioning writes are throttled
  separately so a compromised or fat-fingered admin cannot mass-provision.
- **Audit trail.** Every provisioning action and every login (success and
  failure) writes an audit event with actor, entity, and a payload snapshot.
- **Idempotency and rollback.** One client per email; partial failures leave no
  orphans, so retries are safe.
- **Refresh-token hygiene.** Hashed at rest, httpOnly/secure/strict cookie,
  rotation with replay detection and family invalidation.

---

## 8. Extension points (shaped for future sprints)

The saga takes its input, its actor, and its store as arguments precisely so the
same core backs future channels without a rewrite:

- **Self-service signup.** DONE (S8-002): `runSelfSignup` + `POST /v1/auth/signup`
  reuse the same core with a password-user auth step. See section 2b.
- **Bulk / CSV import.** Loop `runOnboarding` over parsed rows; each row is an
  independent saga, so one bad row rolls itself back without touching the others.
- **Partner / reseller provisioning.** Pass a different actor; audit already
  records who did it.
- **API provisioning.** A machine token hits the same route; the transport
  changes, the saga does not.
- **New auth-user notification.** Swap or wrap `inviteUser` in the store to use a
  branded email provider without touching `runOnboarding`.

---

## 9. Known constraints (as of this build)

- DB migrations cannot be applied from this environment (the Postgres password is
  rejected), so no new columns were added. `notes` is therefore stored inside the
  onboarding audit payload rather than a `clients.notes` column, and "archive" is
  not a client status (only `active` / `suspended` exist). Everything else works
  against the existing schema through the service-role client the API already
  uses. Add the `notes` column and an `archived` status when migrations are
  runnable again.
- Invite-status enrichment lists up to 1000 auth users in one page. Paginate
  `attachInviteStatus` / `findAuthUserByEmail` when the base grows past that.

---

## 10. Where to look

| Concern | File |
|---------|------|
| Saga + store + lifecycle + enrichment | `apps/api/src/services/client-onboarding.ts` |
| Routes + role gates + error mapping | `apps/api/src/routes/admin.ts` |
| Auth (login/refresh/logout, JWT, cookies) | `apps/api/src/routes/auth.ts` |
| Rate limits | `apps/api/src/middleware/rate-limit.ts` |
| Audit events | `apps/api/src/services/audit.ts` |
| Tests (validation, saga, rollback, role gates) | `apps/api/test/client-onboarding.test.ts` |
| Clients CRM + onboarding modal (UI) | `apps/portal/src/AdminClients.tsx` |
| Public client signup (UI) | `apps/portal/src/SignupScreen.tsx` |
