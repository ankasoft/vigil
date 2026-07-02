# Worker Setup

The Cloudflare Worker hosts the API endpoints, the alert cron job, and the database connections.

## 1. Install dependencies

```bash
cd worker
npm install
```

If `wrangler` is not installed globally, run it with `npx wrangler ...`.

## 2. Cloudflare login

```bash
wrangler login
```
A browser opens; authorize your account.

## 3. Create the KV namespace

```bash
wrangler kv namespace create vigil-kv
```

Take the `id` value from the output:
```
🌀  Creating namespace with title "vigil-vigil-kv"
✨  Success!
[[kv_namespaces]]
binding = "KV"
id = "abc123def456..."
```

Replace the `REPLACE_WITH_KV_ID` line in `worker/wrangler.toml` with this id.

## 4. Create the D1 database

```bash
wrangler d1 create vigil
```

Take the `database_id` value from the output and replace the `REPLACE_WITH_D1_ID` line in `wrangler.toml`.

## 5. Apply the schema

There are three migrations: `0001_init.sql` (metric history), `0002_notifications.sql` (notification settings + log),
`0003_hosts.sql` (known server registry).

```bash
npm run db:migrate:remote
```

> `db:migrate` (without the suffix) runs against local D1 — for `wrangler dev` testing.

## 6. Set the secrets

Two shared secrets are required — see [AUTH.md](AUTH.md) for details:

| Secret | Purpose |
|---|---|
| `API_KEY` | Agent → Worker authentication (`X-API-Key`) |
| `ADMIN_TOKEN` | Dashboard → Worker authentication (`X-Admin-Token`) |

Both must be **long and random**:

```bash
# API_KEY (will be stored on each agent host)
openssl rand -hex 32 | wrangler secret put API_KEY

# ADMIN_TOKEN (the value you will enter in the dashboard login modal)
openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN
```

Save both values in a password manager.

## 7. (Optional) Configure the threshold / retention values

The `[vars]` section in `wrangler.toml`:

```toml
[vars]
STALE_SECONDS = "90"                # counted as down if older than this, even if a record exists in KV
METRICS_RETENTION_HOURS = "24"      # how long D1 keeps metric history (hours)
```

These are **public** vars (not secrets). Change them and run `wrangler deploy` again.

## 8. Deploy

```bash
wrangler deploy
```

Output:
```
Total Upload: 78.43 KiB / gzip: 21.10 KiB
Uploaded vigil (4.21 sec)
Published vigil (5.02 sec)
  https://vigil.<your-account>.workers.dev
  ...
Current Deployment ID: ...
```

Save the URL — it will be used as the dashboard's `VITE_API_URL` and the agent's `HUB_URL`.

## 9. Verification

```bash
# /api/servers should be rejected without auth
curl https://vigil.<your-account>.workers.dev/api/servers
# → {"error":"unauthorized"}

# With ADMIN_TOKEN it should return an empty array (no agents yet)
curl -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  https://vigil.<your-account>.workers.dev/api/servers
# → []

# ingest should be rejected without auth
curl -X POST https://vigil.<your-account>.workers.dev/api/ingest \
  -d '{}'
# → {"error":"unauthorized"}
```

## 10. Verify the cron

```bash
wrangler tail
```
You should see a `scheduled` invocation every minute.

---

## Next

➡️  [DASHBOARD.md](DASHBOARD.md) — Pages deploy + first login.

## Updating

After a code change:

```bash
cd worker
git pull
npm install
# If the schema changed:
npm run db:migrate:remote
wrangler deploy
```

## Troubleshooting

| Problem | Where to look |
|---|---|
| `D1_ERROR: no such table` | `npm run db:migrate:remote` was not run |
| Cron not running | `wrangler tail` — verify `[triggers] crons = ["* * * * *"]` |
| 401 on ingest | secret missing or wrong — `wrangler secret put API_KEY` |
| Dashboard 401 | `ADMIN_TOKEN` not set — `wrangler secret put ADMIN_TOKEN`. Then log out of the dashboard → log back in |
