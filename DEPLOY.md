# Kipkiren WS - Deployment

Production topology. The API runs on Railway; the **single portal** (role
picker → shared login → client / admin / task view) is one Cloudflare Pages
project, git-connected to `iamkn1ght/kipkiren-ws` `main`, auto-deploying on push.

| Surface | Host | Domain | Status |
|---|---|---|---|
| API | Railway | `api.ws.kipkiren.co.ke` | ✅ live |
| Portal (all roles) | Cloudflare Pages | `ws.kipkiren.co.ke` | ⏳ create / re-point (below) |

The portal is `apps/portal` - one Vite + React 18 app that internally routes to
the client, admin, or task-view experience based on the signed-in user's role.
(The former three separate apps - client-portal, admin-portal, task-view - were
merged into it.)

---

## Cloudflare Pages - the portal project

Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick
`iamkn1ght/kipkiren-ws`, then:

| Setting | Value |
|---|---|
| Project name | `kipkiren-ws-portal` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | *(leave blank - repo root, so pnpm workspace resolves)* |
| Build command | `pnpm install --frozen-lockfile=false && pnpm --filter @kws/shared build && pnpm --filter @kws/portal build` |
| Build output directory | `apps/portal/dist` |

**Environment variables** (Settings → Environment variables, Production):
| Var | Value |
|---|---|
| `VITE_API_BASE` | `https://api.ws.kipkiren.co.ke` |
| `NODE_VERSION` | `22` |

> Do **not** set `VITE_DEV_AUTH_BYPASS` in production - it's dev-only (local
> `.env.local`). Without it, the portal requires real login.

Then **Custom domains → `ws.kipkiren.co.ke`** (Cloudflare auto-creates the CNAME).
If a previous client-portal Pages project already owns `ws.kipkiren.co.ke`,
either point this project's build at the new `@kws/portal` target or move the
custom domain over.

---

## API CORS + env (Railway → Variables, then redeploy)

```
ALLOWED_ORIGINS=https://ws.kipkiren.co.ke
NODE_ENV=production
```

Only one portal origin is needed now. `NODE_ENV=production` turns on the
`Secure` flag on the refresh cookie (`apps/api/src/routes/auth.ts`).

---

## Verify after deploy

```
curl -I https://ws.kipkiren.co.ke          # 200 - role picker
curl -s https://api.ws.kipkiren.co.ke/v1/health
```

Then: pick a role → log in → land in the matching portal. Users are created in
Supabase (`apps/api/db/seeds/dev_users.sql`); a user's `role` in `public.users`
decides which portal they get.

## Notes
- Auto-deploy: every push to `main` rebuilds the Pages project + the Railway API.
- One role per user (from the JWT). Multi-role accounts are out of scope.
- Local dev: `VITE_PROXY_TARGET=https://api.ws.kipkiren.co.ke pnpm --filter @kws/portal dev`
  (port 5173). `apps/portal/.env.local` carries `VITE_DEV_AUTH_BYPASS=1` for UI work.
