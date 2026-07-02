# Installation — Overview

A full Vigil installation requires **three stages**. Follow them in order:

| # | Stage | Time | Document |
|---|---|---|---|
| 1 | Cloudflare Worker (API + cron) | ~10 min | [WORKER.md](WORKER.md) |
| 2 | Dashboard (Cloudflare Pages) | ~5 min | [DASHBOARD.md](DASHBOARD.md) |
| 3 | Agent (on each server) | <1 min / server | [AGENT.md](AGENT.md) |

Reference:
- [AUTH.md](AUTH.md) — what API_KEY and ADMIN_TOKEN are, how to generate/rotate them
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Telegram & Google Chat notifications
- [OPERATIONS.md](OPERATIONS.md) — changing thresholds, log cleanup, troubleshooting

---

## Prerequisites

- **Cloudflare account** (free tier is enough — Workers + KV + D1 + Pages + Access)
- **Node.js 18+** (local machine — for Wrangler and the dashboard build)
- **wrangler CLI** — `npm install -g wrangler` or `npx wrangler`
- **bash & curl** (for agent installation, on the monitored Linux servers)
- **Python 3.8+** (on the monitored Linux servers — present on nearly every distribution)

---

## Architecture summary

```
   ┌──────────────┐       (1) POST /api/ingest        ┌─────────────────────┐
   │   Agent(s)   │  X-API-Key: YOUR_API_KEY          │   Cloudflare Worker │
   │   Python     │  ─────────────────────────────▶   │   (Hono + D1 + KV)  │
   │   systemd    │  every INTERVAL seconds           │   cron: every 1 min │
   └──────────────┘                                   └──────────┬──────────┘
                                                                 │
                       (2) GET /api/servers, /api/history, ...   │
   ┌──────────────┐    X-Admin-Token: YOUR_ADMIN_TOKEN           │
   │   Dashboard  │  ◀───────────────────────────────────────────┘
   │  React SPA   │     (admin token sorulur, localStorage'da tutulur)
   │  CF Pages    │
   └──────────────┘
                              (3) on threshold/down
                              ┌──────────────────────┐
                              │  Telegram / GChat    │
                              └──────────────────────┘
```

There are two separate **shared secrets**:

1. **Agent → Worker**: `API_KEY` (`X-API-Key` header) — opens only `/api/ingest`.
2. **Browser/Admin → Worker**: `ADMIN_TOKEN` (`X-Admin-Token` header) — opens all other `/api/*` endpoints.

Details: [AUTH.md](AUTH.md).

---

## What's next?

➡️  Start with [WORKER.md](WORKER.md).
