# Vigil — *stay vigilant*

Open-source, zero-dependency, lightweight Linux server monitoring system.
Runs on Cloudflare Workers + D1 + KV; scales without you having to operate a server.

```
  +------------+                      +------------------+        +--------------+
  |  Agent(s)  |       HTTPS          |  Cloudflare      |  fetch |  Dashboard   |
  |  (Python)  | POST /api/ingest --->|  Worker          | <----- |  (React SPA) |
  |  systemd   |                      |  + KV + D1       |        |  CF Pages    |
  +------------+                      |  + Cron (1m)     |        +--------------+
                                      +--------+---------+
                                               |
                                               v  (down / threshold)
                                     Telegram  |  Google Chat
```

## Components

| Folder | What | Where it runs |
|---|---|---|
| `agent/`     | Python 3.8+ stdlib agent + systemd unit | Monitored server |
| `worker/`    | Hono + D1 + KV API + cron alerts        | Cloudflare Workers |
| `dashboard/` | Vite + React + Tailwind SPA             | Cloudflare Pages |
| `docs/`      | Installation docs                       | — |

## Quick start

> See **[docs/en/INSTALL.md](docs/en/INSTALL.md)** for step-by-step instructions.

```bash
# 1. Deploy the Worker
cd worker
npm install
wrangler kv namespace create vigil-kv          # write the id into wrangler.toml
wrangler d1 create vigil                       # write the id into wrangler.toml
npm run db:migrate:remote
wrangler secret put API_KEY                    # long random string (for agents)
wrangler secret put ADMIN_TOKEN                # long random string (for the dashboard)
wrangler deploy

# 2. Deploy the dashboard (Cloudflare Pages)
cd ../dashboard
npm install
# Add VITE_API_URL to the Pages env: https://vigil.<your>.workers.dev
npm run build
# CF Pages: build cmd `npm run build`, dist `dist/`

# 3. Install the agent on a server
curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
  | sudo bash -s -- --key YOUR_API_KEY --hub https://vigil.<your>.workers.dev
```

## Features

- **Spike detection**: The agent samples every 3s and reports current/max/avg every 15s — short spikes don't slip through.
- **Multi-mount disk tracking**: Each filesystem is separate; `/` is summarized.
- **Notifications**: Telegram + Google Chat, with a cooldown per host+reason.
- **Simple auth**: Admin token (login modal) + agent API key. No Cloudflare Access needed.
- **D1 storage**: 24 hours of metric history, 30 days of notification logs.
- **Low overhead**: Agent uses ~0.05% CPU, ~12 MB RAM. Runs even on a Pi Zero.

## Documentation

English (`docs/en/`) · Türkçe (`docs/tr/`)

- [docs/en/INSTALL.md](docs/en/INSTALL.md) — Installation start page
- [docs/en/WORKER.md](docs/en/WORKER.md) — Worker (API + cron) deployment
- [docs/en/DASHBOARD.md](docs/en/DASHBOARD.md) — Dashboard (Pages) deployment
- [docs/en/AGENT.md](docs/en/AGENT.md) — Agent installation & troubleshooting
- [docs/en/AUTH.md](docs/en/AUTH.md) — API_KEY and ADMIN_TOKEN
- [docs/en/NOTIFICATIONS.md](docs/en/NOTIFICATIONS.md) — Telegram & Google Chat
- [docs/en/OPERATIONS.md](docs/en/OPERATIONS.md) — Changing thresholds, log cleanup, troubleshooting

## Contributing

PRs are welcome. Please also update the `docs/` files your change affects —
if setup/operational behavior changes, the docs must stay in sync.

## License

MIT.
