# Notifications — Telegram & Google Chat

Notifications are configured from the dashboard → **Settings** page.
The worker's **cron job** runs once a minute; for hosts that exceed thresholds or are down it
sends a message to the relevant channels and records it in the `notification_log` table.

## Cooldown logic

For the same `(host, reason)` pair, a single notification is sent within **`cooldown_minutes` (default 15)**.
If multiple channels are enabled (Telegram + Google Chat), both are subject to the
same cooldown — it counts jointly per reason.

Example:
- 10:00 — CPU 91% for `prod-db-01` → sent to Telegram + Google Chat.
- 10:05 — still high → **not sent** (cooldown active).
- 10:16 — still high → sent (cooldown has passed).
- 10:05 — **RAM** high for `prod-db-01` (different reason) → sent.

## Thresholds

`Settings → Threshold values`. The CPU/RAM threshold looks at the `*_max` value (the **peak**
within the report window) — so even a 15-second spike is caught.

| Default | Meaning |
|---|---|
| CPU > 85% | high_cpu |
| RAM > 85% | high_ram |
| Disk `/` > 90% | high_disk |
| KV snap missing **or** ts > now - 90s | down |

You can disable down alerts with `alert_on_down=false` (e.g. for spot instances).

---

## Telegram setup

1. **Create a bot**:
   - In Telegram, open a chat with `@BotFather` → `/newbot` → give a name and username → get a **token**.
   - Token format: `123456789:AABBccdd...`

2. **Choose the target chat**:
   - **DM**: your own user ID. Send `/start` to `@userinfobot` → get your ID.
   - **Group**: add the bot to the group (`Add member` → bot username). Then
     activate it with `/start@your_bot_name`.
   - To find out the chat ID:
     ```
     https://api.telegram.org/bot<TOKEN>/getUpdates
     ```
     send a message and read the `chat.id` field. Groups are negative numbers
     (e.g. `-1001234567890`).

3. **Dashboard → Settings → Telegram**:
   - Bot Token: paste
   - Chat ID: paste
   - Toggle: **on**
   - Try it with **Send Test**.
   - **Save**.

Message format (HTML parse_mode):

```
⚠️ [HIGH CPU] prod-db-01
CPU: 91.4% (eşik: 85%)
RAM: 67% | Disk: 45%
Load: 2.4 / 2.1 / 1.8
```

---

## Google Chat setup

1. Google Chat → enter the **Space** where you want to receive notifications.
2. Space name → **Apps & integrations** → **Webhooks** → **Add webhook**.
3. Enter a name and avatar → **Save** → copy the generated URL
   (`https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...`).

4. **Dashboard → Settings → Google Chat**:
   - Webhook URL: paste
   - Toggle: **on**
   - Try it with **Send Test**.
   - **Save**.

Since Google Chat does not support HTML parse_mode, the worker sends the message as plain text + `*` markup.

---

## Masked fields

Every time you open the Settings page, secret fields are displayed as `••••<last4>`.

- **If you leave the masked value as-is** → the backend keeps the existing value.
- **If you type a new value** → the backend saves it.
- If you want to **delete** the token: clear the field completely (leave it empty) and save.

## Notification log

The "Recent notifications" table at the bottom of the dashboard shows the last 50 records
from the D1 `notification_log` table. The worker's cron job clears records older than 30 days every hour.

## Changing the message format

`formatAlertHtml` / `formatAlertPlain` in `worker/src/index.ts`.
After making changes, run `wrangler deploy`.

## Troubleshooting

| Symptom | Solution |
|---|---|
| Send test fails, "telegram 401" | Token is wrong |
| Send test fails, "telegram 400 chat not found" | Chat ID is wrong or the bot has left the group |
| Test succeeds but no alert arrives | Cooldown may be active; check `notification_log` or lower `cooldown_minutes` to 1 and try |
| The same alert arrives twice | Two separate channels enabled (Telegram + GChat) — as expected |
| Google Chat 403 | Webhook URL revoked or pasted incorrectly |
| Turkish characters garbled | Telegram uses HTML parse_mode — `<`/`>` are escaped if present in an agent host name; no other character issues |
