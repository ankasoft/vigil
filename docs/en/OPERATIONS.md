# Operations Guide

Configuration changes, log cleanup, and general troubleshooting after Vigil is up and running.

## Changing threshold values

Dashboard → **Settings** page. CPU/RAM/Disk thresholds and cooldown are changed here;
changes take effect immediately (on the next cron tick).

## Worker `[vars]` settings

The `[vars]` section of `worker/wrangler.toml`:

| Var | Default | Meaning |
|---|---|---|
| `STALE_SECONDS` | `90` | If the KV snap's `ts` field is older than this many seconds, the host is considered **down** |
| `METRICS_RETENTION_HOURS` | `24` | Number of hours retained in the D1 `metrics` table |

Change them and run `wrangler deploy`. These are **public** vars (not secrets).

## Retention periods

| Data | Location | Retention |
|---|---|---|
| Latest snapshot (cache) | KV `snap:*` | **120 s** (TTL) |
| Metric history | D1 `metrics` | `METRICS_RETENTION_HOURS` (default 24 h) |
| Notification log | D1 `notification_log` | **30 days** (hardcoded in cron) |
| Known host record | D1 `hosts` | Unlimited (never deleted; filtered via `last_seen`) |

Changing them:
- Metric retention: `METRICS_RETENTION_HOURS` in `wrangler.toml`.
- Log retention: the `30 * 24 * 3600 * 1000` constant in the `runCron` function inside `worker/src/index.ts`.
- Delete an old host entirely:
  ```bash
  wrangler d1 execute vigil --remote \
    --command "DELETE FROM hosts WHERE host='eski-srv'; \
               DELETE FROM metrics WHERE host='eski-srv';"
  ```

## API_KEY rotation

1. Create a new key and write it with `wrangler secret put API_KEY`.
2. Update the `VIGIL_KEY` value in `/etc/vigil-agent.env` on every agent host.
3. `sudo systemctl restart vigil-agent`.

To avoid a gap: first update all agents (the old key is still accepted),
then set the new one on the worker and **verify from `journalctl` that no old agents remain**.

> Multiple keys are not supported; rotation is easier if a short gap during rotation is acceptable.

## ADMIN_TOKEN rotation

1. Create a new token and write it with `wrangler secret put ADMIN_TOKEN`.
2. Active dashboard tabs get a 401 on their next API call → the login modal opens automatically.
3. Paste the new token.

With multiple users, distribute the new value to all users over a secure channel. Details:
[AUTH.md](AUTH.md).

## Polling intervals (dashboard)

| Endpoint | Interval | Component |
|---|---|---|
| `/api/servers` | 15 s | `ServerGrid` |
| `/api/alerts` | 30 s | `AlertBanner` |
| `/api/history/:host` | 15 s | `ServerDetail` (while the modal is open) |
| `/api/notification/log` | 60 s | `NotificationSettings` |

To change them, edit the `setInterval` value inside the relevant component's `useEffect`.

## Worker quota

Free tier limits (approximate):
- 100k requests/day
- D1: 5M reads + 100k writes/day
- KV: 100k reads + 1k writes/day **per namespace** — KV writes are the critical limit.

A single agent does 1 KV write every 15 s → **5760 writes** per day. 100 agents → 576k → over the free tier.
Solution: to reduce KV writes, increase `INTERVAL` (e.g. 30s → halves it).

## Log analysis

```bash
# Worker logs
wrangler tail

# Agent logs (on the host)
sudo journalctl -u vigil-agent -f
sudo journalctl -u vigil-agent --since "1 hour ago"
```

## Database query examples

```bash
# Highest CPU peaks in the last 1 hour
wrangler d1 execute vigil --remote --command "
  SELECT host, MAX(cpu_max) AS peak
  FROM metrics
  WHERE ts > (strftime('%s','now')-3600)*1000
  GROUP BY host
  ORDER BY peak DESC
  LIMIT 10;
"

# All known hosts and their last report time
wrangler d1 execute vigil --remote --command "
  SELECT host, ip, os, datetime(last_seen/1000,'unixepoch') AS last
  FROM hosts ORDER BY last DESC;
"

# Notifications triggered in the last 24 hours
wrangler d1 execute vigil --remote --command "
  SELECT host, reason, channel, datetime(sent_at/1000,'unixepoch') AS at
  FROM notification_log
  WHERE sent_at > (strftime('%s','now')-86400)*1000
  ORDER BY sent_at DESC;
"
```

## Backup

D1 export:
```bash
wrangler d1 export vigil --remote --output backup-$(date +%F).sql
```

Restore:
```bash
wrangler d1 execute vigil --remote --file=backup-2026-05-15.sql
```

## Manually cleaning up old metric rows

The cron does automatic cleanup every hour; manually:
```bash
wrangler d1 execute vigil --remote --command "
  DELETE FROM metrics WHERE ts < (strftime('%s','now')-86400)*1000;
"
```

## Common troubleshooting paths

| Symptom | Likely cause / solution |
|---|---|
| No hosts on the dashboard | The worker hasn't been deployed, or the agents haven't made their first POST yet |
| Host shows up as a card but all metrics are 0 | First POST is delayed — wait one INTERVAL |
| Dashboard is slow | KV does multiple reads via `Promise.all`; may be a problem with many hosts (>200) |
| Down alarm is a false positive | Set `STALE_SECONDS` from 90 → 120, or lower the agent INTERVAL from 15 → 10 |
| The same host creates two cards | The hostname changed or the same script is running in two places — check `hostname` on the agent host |
| Wrangler `D1_ERROR: too many SQL variables` | Split the migration file, or don't insert more than 100 rows at once |

## Updating

```bash
git pull
cd worker && npm install && npm run db:migrate:remote && wrangler deploy
cd ../dashboard && npm install && npm run build   # can be skipped if Pages deploys automatically
# For agents: re-run install.sh (idempotent)
```

If there is a schema change, a migration file has been added; `npm run db:migrate:remote` runs it
idempotently (CREATE IF NOT EXISTS).
