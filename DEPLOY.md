# Kipkiren WS — Deployment

Production topology. The API runs on Railway; each React portal is a separate
Cloudflare Pages project, git-connected to `iamkn1ght/kipkiren-ws` `main` and
auto-deploying on push.

| Surface | Host | Domain | Status |
|---|---|---|---|
| API | Railway | `api.ws.kipkiren.co.ke` | ✅ live |
| Client portal | Cloudflare Pages | `ws.kipkiren.co.ke` | ✅ live |
| Admin portal | Cloudflare Pages | `admin.ws.kipkiren.co.ke` | ⏳ create (below) |
| Task view | Cloudflare Pages | `tasks.ws.kipkiren.co.ke` | ⏳ create (below) |

All three portals are the same shape (Vite + React 18, read `VITE_API_BASE`
at build time). Each lives in the pnpm workspace, so the build runs from the
repo root and builds `@kws/shared` first.

---

## Cloudflare Pages — create the Admin portal project

Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** → pick
`iamkn1ght/kipkiren-ws`, then:

| Setting | Value |
|---|---|
| Project name | `kipkiren-ws-admin` |
| Production branch | `main` |
| Framework preset | None |
| Root directory | *(leave blank — repo root, so pnpm workspace resolves)* |
| Build command | `pnpm install --frozen-lockfile=false && pnpm --filter @kws/shared build && pnpm --filter @kws/admin-portal build` |
| Build output directory | `apps/admin-portal/dist` |

**Environment variables** (Settings → Environment variables, Production):
| Var | Value |
|---|---|
| `VITE_API_BASE` | `https://api.ws.kipkiren.co.ke` |
| `NODE_VERSION` | `22` |

Then **Custom domains → Set up a domain → `admin.ws.kipkiren.co.ke`** (Cloudflare
auto-creates the CNAME since the zone is on Cloudflare).

## Cloudflare Pages — create the Task-view project

Same steps, with:
| Setting | Value |
|---|---|
| Project name | `kipkiren-ws-tasks` |
| Build command | `pnpm install --frozen-lockfile=false && pnpm --filter @kws/shared build && pnpm --filter @kws/task-view build` |
| Build output directory | `apps/task-view/dist` |
| `VITE_API_BASE` | `https://api.ws.kipkiren.co.ke` |
| `NODE_VERSION` | `22` |
| Custom domain | `tasks.ws.kipkiren.co.ke` |

---

## API CORS — allow the portal origins (required)

The API rejects cross-origin requests from origins not in `ALLOWED_ORIGINS`
(see `apps/api/src/app.ts`). After the domains exist, set this on **Railway →
service → Variables** and redeploy:

```
ALLOWED_ORIGINS=https://ws.kipkiren.co.ke,https://admin.ws.kipkiren.co.ke,https://tasks.ws.kipkiren.co.ke
```

While also set `NODE_ENV=production` (turns on the `Secure` flag on the refresh
cookie — `apps/api/src/routes/auth.ts`).

---

## Verify after deploy

```
# portals serve
curl -I https://admin.ws.kipkiren.co.ke    # 200
curl -I https://tasks.ws.kipkiren.co.ke     # 200

# API reachable + CORS allows the portal
curl -s https://api.ws.kipkiren.co.ke/v1/health
```

Then log in: admin portal with an `admin` user, task view with a
`technical_delivery` user (see `apps/api/db/seeds/dev_users.sql`).

## Notes
- Auto-deploy: every push to `main` rebuilds all connected Pages projects + the
  Railway API. No manual step after the projects exist.
- These portals have no client-side router (single view, in-app tabs), so no SPA
  `_redirects` fallback is required.
