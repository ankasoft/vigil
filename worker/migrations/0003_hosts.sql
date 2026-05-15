-- Vigil: known-hosts registry.
-- Upserted on every /api/ingest. The cron job uses this (not KV list) as the
-- authoritative set of hosts to evaluate, so a host whose KV snapshot expired
-- can still be detected as "down".

CREATE TABLE IF NOT EXISTS hosts (
  host          TEXT    PRIMARY KEY,
  ip            TEXT,
  os            TEXT,
  ram_total_mb  INTEGER,
  first_seen    INTEGER NOT NULL,
  last_seen     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hosts_last_seen ON hosts(last_seen);
