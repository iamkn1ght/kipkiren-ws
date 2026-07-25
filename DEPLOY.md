# Kipkiren WS - Deployment Guide

Everything needed to run, deploy, and operate Kipkiren Web Services (KWS). If you
are new to the project, read "Onboarding a new developer" first, then "How to
deploy production".

---

## 1. Architecture at a glance

```
   Browser (client)   ws.kipkiren.co.ke      (Cloudflare Pages)  VITE_PORTAL_AUDIENCE=client
   Browser (staff)    studio.kipkiren.co.ke  (Cloudflare Pages)  VITE_PORTAL_AUDIENCE=staff
          |                        |
          |   HTTPS: Bearer JWT + httpOnly refresh cookie (path /v1/auth)
          v                        v
   api.ws.kipkiren.co.ke   (Railway)   Node 22 . Express 5 . TypeScript
     - RS256 JWT auth (mints its own tokens; discards the Supabase session)
     - rate limiting, role guards, service-role DB access
          |
          |   service_role key
          v
   Supabase  (project qderqzcyyhnfphrswexm, eu-west-1)   Postgres 17 + Auth
     - auth.users (password hashes)   public.* (clients, tickets, proformas,
       payments, audit_log, ...) with row-level security

   External rails (feature-gated, inert until keys are set):
     Anthropic (AI decomposition) . Kipkiren Pay (M-Pesa) . Paystack (card)
     Todoku (SMS) . Cloudflare API (DNS) . EMAIL_* (transactional email)
```

**Key idea - one codebase, two front doors.** `ws` and `studio` are the *same*
`apps/portal` build; `VITE_PORTAL_AUDIENCE` decides which experience each domain
shows. Both call the *same* API and the *same* Supabase database. The split is
presentational - the real security boundary is the JWT role + Supabase RLS.

---

## 2. Repository structure

Monorepo (pnpm workspaces; `pnpm-workspace.yaml` globs `apps/*` and `packages/*`).

```
kws/
  apps/
    api/                 Backend - Node 22, Express 5, TypeScript (strict)
      src/
        routes/          HTTP routes (auth, tickets, proformas, admin, webhooks)
        services/        Business logic (client-onboarding, proforma, payments, email)
        middleware/      requireAuth/requireRole, rate-limit, error
        lib/             supabase clients, tokens (RS256), content-hash, logger
        config/env.ts    Zod-validated env + feature flags
        app.ts           buildApp() - mounts routes
      db/
        migrations/      0001..0007 SQL
        seeds/           dev_users.sql (bootstrap admin/client/dev logins)
      test/              vitest (supertest for routes, fakes for services)
    portal/              Frontend - Vite + React 18, TypeScript
      public/            favicons, og.png, site.webmanifest
      index.html         head meta / icons / OG
      src/
        App.tsx          audience routing (client/staff) + invite/recovery routing
        auth.tsx         session/JWT state; signIn/signUp/signOut
        api.ts           fetch wrapper (Bearer + one silent refresh on 401)
        ClientPortal.tsx / AdminPortal.tsx / TaskView.tsx
        Landing.tsx / LoginScreen.tsx / SignupScreen.tsx / ResetPassword.tsx
        landing.css      the entire ".klp" warm-editorial design system
  packages/
    shared/              @kws/shared - Zod schemas + types shared by api + portal
  scripts/gen-icons.cjs  regenerate the branding raster set (needs @resvg/resvg-js)
  DEPLOY.md . RECAP.md . ONBOARDING.md . RAILWAY.md
```

---

## 3. Onboarding a new developer

Prereqs: **Node 22**, **pnpm 10**. Do NOT `corepack enable` (Node 22.11 signature
bug); install pnpm directly with `npm i -g pnpm`.

```bash
git clone https://github.com/iamkn1ght/kipkiren-ws.git kws && cd kws
CI=true pnpm install --no-frozen-lockfile      # workspace install
pnpm --filter @kws/shared build                 # build shared types first

# Frontend against the live API (no local backend needed):
VITE_PROXY_TARGET=https://api.ws.kipkiren.co.ke pnpm --filter @kws/portal dev
#   http://localhost:5173 . Add VITE_DEV_AUTH_BYPASS=1 in .env.local to skip
#   login and preview each portal with mock data.

# Backend locally (needs a Tier-1 .env, see section 4):
pnpm --filter @kws/api dev

# Pre-commit checks:
pnpm -r typecheck && pnpm -r lint && pnpm --filter @kws/api test && pnpm --filter @kws/portal build
```

Regenerate branding assets (rare): `pnpm add -D @resvg/resvg-js && node scripts/gen-icons.cjs && pnpm remove @resvg/resvg-js`.

---

## 4. Environment variables

Validated by `apps/api/src/config/env.ts`. **Tier 1** is required to boot;
everything else is a feature flag - absent = that feature returns a clean 503 /
no-ops, never a boot crash.

### API (Railway) - Tier 1 (required)
| Var | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | Railway provides it |
| `SUPABASE_URL` | `https://qderqzcyyhnfphrswexm.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the **service_role** secret (bypasses RLS). NOT the anon key. |
| `SUPABASE_ANON_KEY` | anon/public key (password verify + set-password) |
| `JWT_PRIVATE_KEY_PEM_B64` | base64 of an RS256 **private** PEM (PKCS8) |
| `JWT_PUBLIC_KEY_PEM_B64` | base64 of the **matching** public PEM (SPKI) |
| `JWT_ISSUER` / `JWT_AUDIENCE` | default `ws.kipkiren.co.ke` |
| `JWT_ACCESS_TTL_SECONDS` / `JWT_REFRESH_TTL_SECONDS` | token lifetimes |
| `ALLOWED_ORIGINS` | comma-separated; must include `https://ws.kipkiren.co.ke` AND `https://studio.kipkiren.co.ke` |

Generate a matching JWT pair (both values must come from the same run):
```bash
node -e "const c=require('crypto'),f=require('fs');const{privateKey,publicKey}=c.generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});f.writeFileSync('priv.b64',Buffer.from(privateKey).toString('base64'));f.writeFileSync('pub.b64',Buffer.from(publicKey).toString('base64'));"
# JWT_PRIVATE_KEY_PEM_B64 = priv.b64 , JWT_PUBLIC_KEY_PEM_B64 = pub.b64 , then delete the files
```
A **mismatched** pair makes the API sign tokens it cannot verify -> every authed
request 401s `invalid_token`. This is the #1 outage cause; keep them paired.

### API - feature flags (feature stays inert until all its vars are set)
| Feature | Vars |
|---|---|
| AI decomposition | `ANTHROPIC_API_KEY` (+ `ANTHROPIC_MODEL`, default `claude-sonnet-4-6`) |
| M-Pesa (Kipkiren Pay) | `KIPKIREN_PAY_BASE_URL`, `KIPKIREN_PAY_API_KEY`, `KIPKIREN_PAY_HMAC_SECRET` |
| Card (Paystack) | `PAYSTACK_SECRET_KEY`, `PAYSTACK_WEBHOOK_SECRET` |
| Transactional email | `EMAIL_API_URL`, `EMAIL_API_KEY`, `EMAIL_FROM` (Resend-compatible HTTPS) |
| SMS (Todoku) | `TODOKU_API_BASE`, `TODOKU_KWS_API_KEY`, `TODOKU_KWS_HMAC_SECRET`, `TODOKU_KWS_WEBHOOK_SECRET`, `TODOKU_KWS_SENDER_ID` |
| Cloudflare DNS | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` |
| Agent DNS execution | `AGENT_DNS_EXECUTION_ENABLED` (default off) |
| Logging | `LOG_LEVEL` |

### Portal (Cloudflare Pages) - build-time `VITE_*`
| Var | `ws` project | `studio` project |
|---|---|---|
| `VITE_API_BASE` | `https://api.ws.kipkiren.co.ke` | `https://api.ws.kipkiren.co.ke` |
| `VITE_PORTAL_AUDIENCE` | `client` | `staff` |
| `NODE_VERSION` | `22` | `22` |

---

## 5. Database (Supabase)

- Project `qderqzcyyhnfphrswexm`, **eu-west-1**, Postgres 17.
- Passwords: hashed by Supabase Auth in `auth.users` (bcrypt). The API never
  stores passwords - it verifies via Supabase and mints its own RS256 JWT.
- Migrations: `apps/api/db/migrations/0001..0007`. **0001-0004 applied;
  0005-0007 authored but not yet applied** (blocked on Supabase admin access).
  Apply via the Supabase SQL editor or CLI; migrations are forward-only.
- Seed staff logins: create the auth users in the dashboard, then run
  `apps/api/db/seeds/dev_users.sql` to attach roles.
- Configure **custom SMTP** (Authentication -> Emails) so invite / reset emails
  deliver.

---

## 6. Storage

Not used at MVP. When file uploads arrive (ticket attachments, deliverables), use
a Supabase Storage bucket with per-client RLS; route uploads through the API and
never expose the service key to the browser.

---

## 7. Email

Two independent paths, both build-complete but currently un-provisioned (no-op
until configured):
1. **Supabase Auth emails** (invite, password reset) - via Supabase custom SMTP
   (e.g. Google Workspace / Resend SMTP). Needed for admin-invite onboarding and
   forgot-password delivery.
2. **App notifications** (`services/email.ts`, `EMAIL_*`) - ticket/proforma/
   payment emails via a Resend-compatible HTTPS API (provider-agnostic adapter).

---

## 8. Payments

- Feature-gated rails. Client checkout (`ClientPortal` proforma -> Accept & pay)
  calls `POST /v1/proformas/:id/approve` with `rail: 'mpesa' | 'card'`.
- **M-Pesa** via Kipkiren Pay (STK push); **Card** via Paystack (hosted page).
  Both confirm via HMAC-verified webhooks (`routes/webhooks.ts`), the only place
  `proforma_approvals` is INSERTed (an abandoned approval never locks scope).
- Adding live keys later needs **no code change** - set the feature-flag vars.
- Bank transfer is an offline path (client quotes the proforma ref; ops confirm).

---

## 9. How to deploy production

**API (Railway).** Auto-deploys on push to `main` when `apps/api` files change
(portal-only pushes are skipped - expected). A variable change needs a redeploy:
Railway -> service -> Variables (apply) or Deployments -> Redeploy.

**Portal (Cloudflare Pages).** Two projects, both connected to
`iamkn1ght/kipkiren-ws` `main`, auto-deploy on push:
- Build: `pnpm install --frozen-lockfile=false && pnpm --filter @kws/shared build && pnpm --filter @kws/portal build`
- Output: `apps/portal/dist`
- Env per project as in section 4 (only `VITE_PORTAL_AUDIENCE` differs).

Release flow used in this repo (`main` is production for both):
```bash
git checkout main && git merge --ff-only feat/portal-redesign && git push origin main && git checkout feat/portal-redesign
```

Post-deploy smoke check (auth breaks first):
```bash
BASE=https://api.ws.kipkiren.co.ke
curl -s -o /dev/null -w "health %{http_code}\n" $BASE/v1/health   # 200
# then: sign up a throwaway client -> expect an access_token, and an authed GET -> 200
```

---

## 10. How to roll back

- **API:** Railway -> Deployments -> last-good deployment -> **Redeploy**
  (instant; that build + current env). Or `git revert <sha>` and push.
- **Portal:** Cloudflare Pages -> project -> Deployments -> a previous build ->
  **Rollback to this deployment**. Or `git revert` + push.
- **Database:** forward-only migrations; write a reversing migration. Restore from
  a Supabase backup (paid tier) if needed.

---

## 11. Common issues

| Symptom | Cause / fix |
|---|---|
| Every authed call `401 invalid_token`, dashboards empty | `JWT_PUBLIC_KEY_PEM_B64` is not the pair of the private key. Set a matching pair (section 4) and redeploy. |
| Login `session_issue_failed` | Historically `signInWithPassword` ran on the shared service client (RLS blocked the refresh-token insert). Fixed - login uses a throwaway verify client. If it recurs, confirm the DB is writable. |
| Reads work but writes 500 / `internal_error` | Usually a stale DB connection in a long-lived process - redeploy (restart). Confirm the Supabase project isn't paused/read-only. |
| `studio` can't reach the API (CORS) | Add `https://studio.kipkiren.co.ke` to `ALLOWED_ORIGINS`; redeploy the API. |
| Invite / reset emails never arrive | Supabase custom SMTP not configured (section 7). The request succeeds; delivery is the gap. |
| Migrations won't apply from MCP | MCP scoped to another org; apply 0005-0007 via the Supabase dashboard SQL editor. |

---

## 12. CI/CD

- **Source of truth:** GitHub `iamkn1ght/kipkiren-ws`, branch `main`.
- **Trigger:** push to `main` -> Railway (API, on `apps/api` changes) + both
  Cloudflare Pages projects build and deploy automatically.
- **Gates before merge:** `pnpm -r typecheck`, `pnpm -r lint`,
  `pnpm --filter @kws/api test`, `pnpm --filter @kws/portal build`.
- No secrets in the repo - they live in Railway (API) and Cloudflare (portal) env.

---

*Kipkiren WS - operated by Kipkiren Teknolojia . Nairobi . Confidential.*
