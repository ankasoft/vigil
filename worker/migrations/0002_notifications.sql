-- Vigil: notification configuration and delivery log.
-- `notifications_config` is a singleton row (id=1).
-- `notification_log` stores every successful delivery (used for cooldown checks and UI history).

CREATE TABLE IF NOT EXISTS notifications_config (
  id                      INTEGER PRIMARY KEY DEFAULT 1,

  telegram_enabled        INTEGER DEFAULT 0,
  telegram_bot_token      TEXT,
  telegram_chat_id        TEXT,

  googlechat_enabled      INTEGER DEFAULT 0,
  googlechat_webhook_url  TEXT,

  threshold_cpu           INTEGER DEFAULT 85,
  threshold_ram           INTEGER DEFAULT 85,
  threshold_disk          INTEGER DEFAULT 90,

  alert_on_down           INTEGER DEFAULT 1,
  cooldown_minutes        INTEGER DEFAULT 15,

  updated_at              INTEGER
);

-- Seed the singleton row so the UI always has something to read.
INSERT OR IGNORE INTO notifications_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS notification_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  host      TEXT    NOT NULL,
  channel   TEXT    NOT NULL,  -- 'telegram' | 'googlechat'
  reason    TEXT    NOT NULL,  -- 'down' | 'high_cpu' | 'high_ram' | 'high_disk'
  sent_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_log_host_reason_sent
  ON notification_log(host, reason, sent_at);

CREATE INDEX IF NOT EXISTS idx_notif_log_sent
  ON notification_log(sent_at);
