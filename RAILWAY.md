# Deploying Kipkiren WS API to Railway

This is the exact click-path for the first Railway deploy. Do it once.

## Prerequisites you (Chamia) need before deploying

You will be 500-ing until all four of these are true. Railway **will** build and start the service before these are set, but every request will fail at `loadEnv()` until they land.

1. **Supabase project provisioned in `eu-west-1`** (Ireland). This is the resolved region (Option B — see `DECISION_REGION_DIVERGENCE.md`), aligned to the platform standard and superseding the original af-south-1 / KWS-SEC-014 position. The cross-border transfer is disclosed under KDPA 2019 §48–49 (wording pending counsel review). You cannot change region later without a full migration.
2. **Migrations applied** to that Supabase project, in order:
   ```
   apps/api/db/migrations/0001_schema.sql
   apps/api/db/migrations/0002_rls.sql
   apps/api/db/migrations/0003_insert_only.sql
   apps/api/db/seeds/retainer_plans.sql
   apps/api/db/seeds/rate_card_v1.sql
   ```
   Paste them into Supabase → SQL Editor in that order.
3. **JWT RS256 keypair generated** (see `README.md` → "Generating the JWT RS256 keypair"). Base64-encoded values ready to paste into Railway env.
4. **Kipkiren Pay M-Pesa is live** (ADR-KWS-005). Card path via Paystack can go live independently.

## Railway setup — step by step

### 1. Create the project from GitHub

- Go to [railway.app/new](https://railway.app/new)
- Choose **"Deploy from GitHub repo"**
- Authorise Railway on your GitHub account (first time only)
- Pick the **`kipkiren-ws`** repo (private is fine — Railway honours the GitHub access)
- Railway detects `railway.json` + `nixpacks.toml` and auto-configures build + start

### 2. Set the environment variables

In the new service → **Variables** tab, paste each of these. Values come from your Supabase project + your secret store — never from the inaugural pack docs.

```
NODE_ENV=production
PORT=8080
LOG_LEVEL=info

SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key from Supabase → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<service_role key from same page — NEVER share>

JWT_PRIVATE_KEY_PEM_B64=<base64 of kws-jwt.key>
JWT_PUBLIC_KEY_PEM_B64=<base64 of kws-jwt.pub>
JWT_ISSUER=ws.kipkiren.co.ke
JWT_AUDIENCE=ws.kipkiren.co.ke
JWT_ACCESS_TTL_SECONDS=900
JWT_REFRESH_TTL_SECONDS=2592000

ANTHROPIC_API_KEY=<dedicated KWS key — not shared with Bongo or Ace Mtihani>
ANTHROPIC_MODEL=claude-sonnet-4-6

KIPKIREN_PAY_BASE_URL=<Kipkiren Pay base URL>
KIPKIREN_PAY_API_KEY=<Kipkiren Pay API key>
KIPKIREN_PAY_HMAC_SECRET=<Kipkiren Pay webhook HMAC secret>

PAYSTACK_SECRET_KEY=<sk_live_... from Paystack dashboard>
PAYSTACK_WEBHOOK_SECRET=<webhook secret from Paystack → Settings → Webhooks>

CLOUDFLARE_API_TOKEN=<scoped DNS-edit token — Cloudflare → My Profile → API Tokens>
CLOUDFLARE_ACCOUNT_ID=<Cloudflare account id (optional — token scopes the zone)>

TODOKU_API_BASE=<Todoku v1 base URL — confirm host with operator>
TODOKU_KWS_API_KEY=<kws tenant app_id — from operator handover>
TODOKU_KWS_HMAC_SECRET=<base64 HMAC secret — request signing>
TODOKU_KWS_WEBHOOK_SECRET=<base64 HMAC secret — inbound webhook verification>
TODOKU_KWS_SENDER_ID=<KIPS-WS or carrier-approved sender id>

ALLOWED_ORIGINS=https://ws.kipkiren.co.ke,https://admin.ws.kipkiren.co.ke,https://tasks.ws.kipkiren.co.ke
```

Any missing or malformed value causes the Zod env loader to throw at startup — the service logs will tell you exactly which variable is missing.

### 3. Set the public domain

- In the service → **Settings** → **Networking** → **Generate Domain**
- Railway gives you `kipkiren-ws-production.up.railway.app` or similar
- Add a custom domain: `api.ws.kipkiren.co.ke` → Railway prints the CNAME target → add that CNAME in Cloudflare DNS
- Cloudflare issues the cert automatically via the Cloudflare proxy

### 4. Smoke test

Once the deploy is green:

```
curl https://api.ws.kipkiren.co.ke/v1/health
# → {"status":"ok","service":"kws-api","ts":"..."}

curl https://api.ws.kipkiren.co.ke/v1/.well-known/jwks.json
# → {"keys":[{"kty":"RSA","n":"...","e":"AQAB","kid":"...","use":"sig","alg":"RS256"}]}
```

If `/health` returns 200 but `/jwks` returns 500, your RS256 env vars are wrong (base64 encoding or line endings). If `/health` itself 500s, `loadEnv()` is throwing — check the logs for the Zod error message.

### 5. Wire the webhooks to the gateways

Only after the smoke test is green:

- **Kipkiren Pay (LipaPlus)**: set the callback URL in their dashboard to `https://api.ws.kipkiren.co.ke/v1/webhooks/mpesa`. Confirm they will sign requests with `KIPKIREN_PAY_HMAC_SECRET` via the `x-kipkiren-pay-signature` header (HMAC-SHA256 hex of the raw body). If the real LipaPlus contract differs from that shape, tell Claude and the adapter gets updated.
- **Paystack**: Dashboard → Settings → Webhooks → add `https://api.ws.kipkiren.co.ke/v1/webhooks/paystack`. Paystack posts `charge.success` and signs with `PAYSTACK_SECRET_KEY` via the `x-paystack-signature` header (HMAC-SHA512 hex of the raw body). This is already what the handler expects.

### 6. First live M-Pesa test (Chamia directly)

Recorded in `kws_reboot_pack_v1.md` §12 as an outstanding CEO action. Do it from your personal Safaricom line against a test proforma (KES 1 if Kipkiren Pay allows). Confirm the `proforma_approvals` row appears in Supabase and the audit_log has `payment_confirmed` + `scope_locked` events. This is your first real end-to-end validation.

## Auto-deploy

After step 1 Railway will redeploy automatically on every push to the default branch. No extra config. Check the **Deployments** tab to watch a build.

## If something goes wrong on first deploy

- **Build fails at install**: Railway couldn't resolve pnpm workspaces. Check the build log, usually a missing `packageManager` or corepack issue. The `nixpacks.toml` in this repo explicitly enables corepack and pins Node 22 + pnpm 9, so it should Just Work™.
- **Build succeeds, start fails**: `loadEnv()` threw. Read the first 20 lines of runtime logs — the Zod error lists which var is missing.
- **Healthcheck fails**: the service is up but `/v1/health` didn't respond in 30s. Usually a port-binding issue — verify `PORT=8080` is set.

## Rollback

Railway keeps all previous deploys. To roll back: **Deployments** → click an older one → **Redeploy**. Takes about 60 seconds.
