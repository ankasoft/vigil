-- Vigil: metrics history table.
-- Stores one row per agent report (every INTERVAL seconds, default 15s).
-- `cpu`/`ram` are instantaneous values at report time.
-- `*_max`/`*_avg` are aggregates over the report window (oversampled internally by agent).
-- `disks_json` carries all mountpoints; `disk_root` is the convenience flat copy of `/`.

CREATE TABLE IF NOT EXISTS metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  host        TEXT    NOT NULL,
  ts          INTEGER NOT NULL,

  cpu         REAL,
  cpu_max     REAL,
  cpu_avg     REAL,

  ram         REAL,
  ram_max     REAL,
  ram_avg     REAL,

  disk_root   REAL,
  disks_json  TEXT,

  net_in      REAL,
  net_out     REAL,

  load1       REAL,
  load5       REAL,
  load15      REAL,

  uptime      INTEGER
);

CREATE INDEX IF NOT EXISTS idx_metrics_host_ts ON metrics(host, ts);
CREATE INDEX IF NOT EXISTS idx_metrics_ts      ON metrics(ts);
