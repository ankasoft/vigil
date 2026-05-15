/**
 * Vigil Worker — ingest, query, alert.
 *
 *  - POST /api/ingest .................. agent push, X-API-Key required
 *  - GET  /api/servers ................. latest snapshot per host (KV + hosts join)
 *  - GET  /api/history/:host ........... last N D1 rows for one host
 *  - GET  /api/alerts .................. current threshold violations
 *  - GET  /api/notification/settings ... masked
 *  - PUT  /api/notification/settings ... upsert (masked fields preserved)
 *  - POST /api/notification/test/:ch ... send test message
 *  - GET  /api/notification/log ........ last 50 deliveries
 *
 * The non-ingest endpoints are expected to be fronted by Cloudflare Access.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  KV: KVNamespace;
  DB: D1Database;
  API_KEY: string;        // shared with agents (X-API-Key on /api/ingest)
  ADMIN_TOKEN: string;    // dashboard/admin token (X-Admin-Token on all other endpoints)
  STALE_SECONDS?: string;
  METRICS_RETENTION_HOURS?: string;
};

// --- Constants ---------------------------------------------------------------

const SNAP_PREFIX = 'snap:';
const SNAP_TTL_SECONDS = 120;           // KV cache for "latest snapshot"
const HISTORY_LIMIT = 120;              // /api/history/:host row cap
const DEFAULT_STALE_SECONDS = 90;       // host considered down if ts < now - this
const DEFAULT_RETENTION_HOURS = 24;
const NOTIFICATION_LOG_LIMIT = 50;

// --- Types -------------------------------------------------------------------

interface DiskMount {
  mount: string;
  pct: number;
  used_gb: number;
  total_gb: number;
}

interface IngestPayload {
  host: string;
  ip?: string;
  os?: string;
  ts: number;
  cpu: number;
  cpu_max?: number;
  cpu_avg?: number;
  ram: number;
  ram_max?: number;
  ram_avg?: number;
  ram_total_mb?: number;
  disk_root: number;
  disks?: DiskMount[];
  net_in: number;
  net_out: number;
  load1: number;
  load5: number;
  load15: number;
  uptime: number;
}

interface ServerSnapshot extends IngestPayload {
  // Same shape as IngestPayload; declared separately for clarity in responses.
}

interface NotificationsConfig {
  telegram_enabled: number;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  googlechat_enabled: number;
  googlechat_webhook_url: string | null;
  threshold_cpu: number;
  threshold_ram: number;
  threshold_disk: number;
  alert_on_down: number;
  cooldown_minutes: number;
  updated_at: number | null;
}

type AlertReason = 'down' | 'high_cpu' | 'high_ram' | 'high_disk';

interface Alert {
  host: string;
  reason: AlertReason;
  value?: number;
  threshold?: number;
}

// --- Helpers -----------------------------------------------------------------

function mask(secret: string | null | undefined): string {
  if (!secret) return '';
  if (secret.length <= 4) return '••••';
  return '••••' + secret.slice(-4);
}

function isMasked(s: string | undefined | null): boolean {
  return typeof s === 'string' && s.includes('••');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function staleSeconds(env: Env): number {
  const n = Number(env.STALE_SECONDS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STALE_SECONDS;
}

function retentionHours(env: Env): number {
  const n = Number(env.METRICS_RETENTION_HOURS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_HOURS;
}

// --- App ---------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'X-API-Key', 'X-Admin-Token'],
    maxAge: 86400,
  }),
);

// --- Admin auth -------------------------------------------------------------
// Every endpoint under /api/* except /api/ingest requires the admin token.
// /api/ingest authenticates agents via X-API-Key (handled in its own handler).
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/api/ingest') return next();
  const t = c.req.header('X-Admin-Token');
  if (!t || t !== c.env.ADMIN_TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
});

// --- Ingest ------------------------------------------------------------------

app.post('/api/ingest', async (c) => {
  const key = c.req.header('X-API-Key');
  if (!key || key !== c.env.API_KEY) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  let p: IngestPayload;
  try {
    p = await c.req.json<IngestPayload>();
  } catch {
    return c.json({ error: 'invalid_json' }, 400);
  }

  if (!p.host || typeof p.host !== 'string' || typeof p.ts !== 'number') {
    return c.json({ error: 'invalid_payload' }, 400);
  }

  // Normalise aggregates (fall back to current value if not supplied).
  const cpuMax = p.cpu_max ?? p.cpu;
  const cpuAvg = p.cpu_avg ?? p.cpu;
  const ramMax = p.ram_max ?? p.ram;
  const ramAvg = p.ram_avg ?? p.ram;

  const snapshot: ServerSnapshot = {
    ...p,
    cpu_max: cpuMax,
    cpu_avg: cpuAvg,
    ram_max: ramMax,
    ram_avg: ramAvg,
  };

  const now = Date.now();

  // 1. KV — short-lived "latest snapshot" cache.
  await c.env.KV.put(SNAP_PREFIX + p.host, JSON.stringify(snapshot), {
    expirationTtl: SNAP_TTL_SECONDS,
  });

  // 2. D1 — history row.
  await c.env.DB.prepare(
    `INSERT INTO metrics
      (host, ts, cpu, cpu_max, cpu_avg, ram, ram_max, ram_avg,
       disk_root, disks_json, net_in, net_out, load1, load5, load15, uptime)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  )
    .bind(
      p.host,
      p.ts,
      p.cpu,
      cpuMax,
      cpuAvg,
      p.ram,
      ramMax,
      ramAvg,
      p.disk_root,
      p.disks ? JSON.stringify(p.disks) : null,
      p.net_in,
      p.net_out,
      p.load1,
      p.load5,
      p.load15,
      p.uptime,
    )
    .run();

  // 3. D1 — hosts upsert.
  await c.env.DB.prepare(
    `INSERT INTO hosts (host, ip, os, ram_total_mb, first_seen, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(host) DO UPDATE SET
       ip = excluded.ip,
       os = excluded.os,
       ram_total_mb = excluded.ram_total_mb,
       last_seen = excluded.last_seen`,
  )
    .bind(p.host, p.ip ?? null, p.os ?? null, p.ram_total_mb ?? null, now, now)
    .run();

  // 4. 10% chance: prune old metrics rows. Deterministic daily cleanup runs in cron.
  if (Math.random() < 0.1) {
    const cutoff = now - retentionHours(c.env) * 3600 * 1000;
    c.executionCtx.waitUntil(
      c.env.DB.prepare('DELETE FROM metrics WHERE ts < ?').bind(cutoff).run(),
    );
  }

  return c.json({ ok: true });
});

// --- Servers (latest snapshots) ---------------------------------------------

app.get('/api/servers', async (c) => {
  // Authoritative host list comes from the hosts table.
  // Alphabetical order so the dashboard layout stays stable between polls.
  const hostsRes = await c.env.DB.prepare(
    `SELECT host, ip, os, ram_total_mb, first_seen, last_seen
       FROM hosts
       WHERE last_seen > ?
       ORDER BY host ASC`,
  )
    .bind(Date.now() - retentionHours(c.env) * 3600 * 1000)
    .all<{
      host: string;
      ip: string | null;
      os: string | null;
      ram_total_mb: number | null;
      first_seen: number;
      last_seen: number;
    }>();

  const hosts = hostsRes.results ?? [];
  if (hosts.length === 0) return c.json([]);

  const snaps = await Promise.all(
    hosts.map((h) => c.env.KV.get<ServerSnapshot>(SNAP_PREFIX + h.host, 'json')),
  );

  const now = Date.now();
  const stale = staleSeconds(c.env) * 1000;

  const result = hosts.map((h, i) => {
    const snap = snaps[i];
    const online = snap && now - snap.ts <= stale;
    return {
      host: h.host,
      ip: h.ip ?? snap?.ip ?? null,
      os: h.os ?? snap?.os ?? null,
      ram_total_mb: h.ram_total_mb ?? snap?.ram_total_mb ?? null,
      first_seen: h.first_seen,
      last_seen: h.last_seen,
      online: !!online,
      snapshot: snap ?? null,
    };
  });

  return c.json(result);
});

// --- History ----------------------------------------------------------------

app.get('/api/history/:host', async (c) => {
  const host = c.req.param('host');
  const res = await c.env.DB.prepare(
    `SELECT ts, cpu, cpu_max, cpu_avg, ram, ram_max, ram_avg,
            disk_root, disks_json, net_in, net_out, load1
       FROM metrics
       WHERE host = ?
       ORDER BY ts DESC
       LIMIT ?`,
  )
    .bind(host, HISTORY_LIMIT)
    .all<{
      ts: number;
      cpu: number;
      cpu_max: number;
      cpu_avg: number;
      ram: number;
      ram_max: number;
      ram_avg: number;
      disk_root: number;
      disks_json: string | null;
      net_in: number;
      net_out: number;
      load1: number;
    }>();

  const rows = (res.results ?? []).map((r) => ({
    ...r,
    disks: r.disks_json ? (JSON.parse(r.disks_json) as DiskMount[]) : [],
    disks_json: undefined,
  }));

  // Return oldest-first for charts.
  rows.reverse();
  return c.json(rows);
});

// --- Alerts -----------------------------------------------------------------

app.get('/api/alerts', async (c) => {
  const cfg = await loadConfig(c.env);
  const alerts = await evaluateAlerts(c.env, cfg);
  return c.json(alerts);
});

// --- Notification settings --------------------------------------------------

app.get('/api/notification/settings', async (c) => {
  const cfg = await loadConfig(c.env);
  return c.json({
    telegram_enabled: !!cfg.telegram_enabled,
    telegram_bot_token: mask(cfg.telegram_bot_token),
    telegram_chat_id: cfg.telegram_chat_id ?? '',
    googlechat_enabled: !!cfg.googlechat_enabled,
    googlechat_webhook_url: mask(cfg.googlechat_webhook_url),
    threshold_cpu: cfg.threshold_cpu,
    threshold_ram: cfg.threshold_ram,
    threshold_disk: cfg.threshold_disk,
    alert_on_down: !!cfg.alert_on_down,
    cooldown_minutes: cfg.cooldown_minutes,
  });
});

app.put('/api/notification/settings', async (c) => {
  const body = await c.req.json<{
    telegram_enabled?: boolean;
    telegram_bot_token?: string;
    telegram_chat_id?: string;
    googlechat_enabled?: boolean;
    googlechat_webhook_url?: string;
    threshold_cpu?: number;
    threshold_ram?: number;
    threshold_disk?: number;
    alert_on_down?: boolean;
    cooldown_minutes?: number;
  }>();

  const existing = await loadConfig(c.env);

  // Masked secrets coming back from the UI mean "unchanged" — keep existing value.
  const telegram_bot_token = isMasked(body.telegram_bot_token)
    ? existing.telegram_bot_token
    : body.telegram_bot_token ?? existing.telegram_bot_token;
  const googlechat_webhook_url = isMasked(body.googlechat_webhook_url)
    ? existing.googlechat_webhook_url
    : body.googlechat_webhook_url ?? existing.googlechat_webhook_url;

  const merged: NotificationsConfig = {
    telegram_enabled: body.telegram_enabled === undefined
      ? existing.telegram_enabled
      : body.telegram_enabled ? 1 : 0,
    telegram_bot_token,
    telegram_chat_id: body.telegram_chat_id ?? existing.telegram_chat_id,
    googlechat_enabled: body.googlechat_enabled === undefined
      ? existing.googlechat_enabled
      : body.googlechat_enabled ? 1 : 0,
    googlechat_webhook_url,
    threshold_cpu: body.threshold_cpu ?? existing.threshold_cpu,
    threshold_ram: body.threshold_ram ?? existing.threshold_ram,
    threshold_disk: body.threshold_disk ?? existing.threshold_disk,
    alert_on_down: body.alert_on_down === undefined
      ? existing.alert_on_down
      : body.alert_on_down ? 1 : 0,
    cooldown_minutes: body.cooldown_minutes ?? existing.cooldown_minutes,
    updated_at: Date.now(),
  };

  await c.env.DB.prepare(
    `UPDATE notifications_config SET
       telegram_enabled = ?,
       telegram_bot_token = ?,
       telegram_chat_id = ?,
       googlechat_enabled = ?,
       googlechat_webhook_url = ?,
       threshold_cpu = ?,
       threshold_ram = ?,
       threshold_disk = ?,
       alert_on_down = ?,
       cooldown_minutes = ?,
       updated_at = ?
     WHERE id = 1`,
  )
    .bind(
      merged.telegram_enabled,
      merged.telegram_bot_token,
      merged.telegram_chat_id,
      merged.googlechat_enabled,
      merged.googlechat_webhook_url,
      merged.threshold_cpu,
      merged.threshold_ram,
      merged.threshold_disk,
      merged.alert_on_down,
      merged.cooldown_minutes,
      merged.updated_at,
    )
    .run();

  return c.json({ ok: true });
});

// --- Test send --------------------------------------------------------------

app.post('/api/notification/test/:channel', async (c) => {
  const channel = c.req.param('channel');
  const cfg = await loadConfig(c.env);
  const text = `🔔 [Vigil test] notification channel is reachable.\n` +
    `Time: ${new Date().toISOString()}`;

  try {
    if (channel === 'telegram') {
      if (!cfg.telegram_bot_token || !cfg.telegram_chat_id) {
        return c.json({ ok: false, error: 'telegram_not_configured' }, 400);
      }
      await sendTelegram(cfg.telegram_bot_token, cfg.telegram_chat_id, escapeHtml(text));
    } else if (channel === 'googlechat') {
      if (!cfg.googlechat_webhook_url) {
        return c.json({ ok: false, error: 'googlechat_not_configured' }, 400);
      }
      await sendGoogleChat(cfg.googlechat_webhook_url, text);
    } else {
      return c.json({ ok: false, error: 'unknown_channel' }, 400);
    }
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
});

// --- Notification log -------------------------------------------------------

app.get('/api/notification/log', async (c) => {
  const res = await c.env.DB.prepare(
    `SELECT id, host, channel, reason, sent_at
       FROM notification_log
       ORDER BY sent_at DESC
       LIMIT ?`,
  )
    .bind(NOTIFICATION_LOG_LIMIT)
    .all();
  return c.json(res.results ?? []);
});

// --- Shared: config loader --------------------------------------------------

async function loadConfig(env: Env): Promise<NotificationsConfig> {
  const row = await env.DB.prepare(
    `SELECT telegram_enabled, telegram_bot_token, telegram_chat_id,
            googlechat_enabled, googlechat_webhook_url,
            threshold_cpu, threshold_ram, threshold_disk,
            alert_on_down, cooldown_minutes, updated_at
       FROM notifications_config WHERE id = 1`,
  ).first<NotificationsConfig>();

  if (row) return row;

  // Defensive default: a fresh DB without seed insert.
  return {
    telegram_enabled: 0,
    telegram_bot_token: null,
    telegram_chat_id: null,
    googlechat_enabled: 0,
    googlechat_webhook_url: null,
    threshold_cpu: 85,
    threshold_ram: 85,
    threshold_disk: 90,
    alert_on_down: 1,
    cooldown_minutes: 15,
    updated_at: null,
  };
}

// --- Shared: alert evaluation (used by /api/alerts and cron) ----------------

async function evaluateAlerts(env: Env, cfg: NotificationsConfig): Promise<Alert[]> {
  const now = Date.now();
  const stale = staleSeconds(env) * 1000;

  const hostsRes = await env.DB.prepare(
    `SELECT host FROM hosts WHERE last_seen > ?`,
  )
    .bind(now - retentionHours(env) * 3600 * 1000)
    .all<{ host: string }>();
  const hosts = (hostsRes.results ?? []).map((r) => r.host);
  if (hosts.length === 0) return [];

  const snaps = await Promise.all(
    hosts.map((h) => env.KV.get<ServerSnapshot>(SNAP_PREFIX + h, 'json')),
  );

  const alerts: Alert[] = [];
  for (let i = 0; i < hosts.length; i++) {
    const host = hosts[i];
    const snap = snaps[i];
    const isDown = !snap || now - snap.ts > stale;

    if (isDown) {
      if (cfg.alert_on_down) alerts.push({ host, reason: 'down' });
      continue;
    }

    const cpuPeak = snap.cpu_max ?? snap.cpu;
    const ramPeak = snap.ram_max ?? snap.ram;

    if (cpuPeak > cfg.threshold_cpu) {
      alerts.push({ host, reason: 'high_cpu', value: cpuPeak, threshold: cfg.threshold_cpu });
    }
    if (ramPeak > cfg.threshold_ram) {
      alerts.push({ host, reason: 'high_ram', value: ramPeak, threshold: cfg.threshold_ram });
    }
    if (snap.disk_root > cfg.threshold_disk) {
      alerts.push({ host, reason: 'high_disk', value: snap.disk_root, threshold: cfg.threshold_disk });
    }
  }
  return alerts;
}

// --- Notification senders ---------------------------------------------------

async function sendTelegram(token: string, chatId: string, html: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: 'HTML' }),
  });
  if (!r.ok) throw new Error(`telegram ${r.status}: ${await r.text()}`);
}

async function sendGoogleChat(webhookUrl: string, text: string): Promise<void> {
  const r = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) throw new Error(`googlechat ${r.status}: ${await r.text()}`);
}

// --- Alert formatting -------------------------------------------------------

function formatAlertHtml(alert: Alert, snap: ServerSnapshot | null): string {
  const host = escapeHtml(alert.host);
  switch (alert.reason) {
    case 'down': {
      const ago = snap ? Math.round((Date.now() - snap.ts) / 60000) : null;
      return `🔴 <b>[DOWN]</b> ${host}\nSunucu yanıt vermiyor.` +
        (ago !== null ? `\nSon görülme: ${ago} dakika önce` : '');
    }
    case 'high_cpu':
      return `⚠️ <b>[HIGH CPU]</b> ${host}\n` +
        `CPU: ${alert.value?.toFixed(1)}% (eşik: ${alert.threshold}%)\n` +
        (snap ? `RAM: ${snap.ram.toFixed(0)}% | Disk: ${snap.disk_root.toFixed(0)}%\n` +
                `Load: ${snap.load1} / ${snap.load5} / ${snap.load15}` : '');
    case 'high_ram':
      return `⚠️ <b>[HIGH RAM]</b> ${host}\n` +
        `RAM: ${alert.value?.toFixed(1)}% (eşik: ${alert.threshold}%)\n` +
        (snap ? `CPU: ${snap.cpu.toFixed(0)}% | Disk: ${snap.disk_root.toFixed(0)}%` : '');
    case 'high_disk':
      return `⚠️ <b>[HIGH DISK]</b> ${host}\n` +
        `Disk: ${alert.value?.toFixed(1)}% (eşik: ${alert.threshold}%)`;
  }
}

function formatAlertPlain(alert: Alert, snap: ServerSnapshot | null): string {
  // Google Chat doesn't render HTML the same way; send plain text.
  return formatAlertHtml(alert, snap).replace(/<\/?b>/g, '*');
}

// --- Cron -------------------------------------------------------------------

export default {
  fetch: app.fetch,

  async scheduled(_evt: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCron(env));
  },
};

async function runCron(env: Env): Promise<void> {
  const cfg = await loadConfig(env);
  const now = Date.now();

  // Deterministic daily-ish cleanup at the top of every hour.
  if (new Date(now).getUTCMinutes() === 0) {
    const cutoff = now - retentionHours(env) * 3600 * 1000;
    await env.DB.prepare('DELETE FROM metrics WHERE ts < ?').bind(cutoff).run();
    await env.DB
      .prepare('DELETE FROM notification_log WHERE sent_at < ?')
      .bind(now - 30 * 24 * 3600 * 1000) // keep 30 days of log
      .run();
  }

  if (!cfg.telegram_enabled && !cfg.googlechat_enabled) return;

  const alerts = await evaluateAlerts(env, cfg);
  if (alerts.length === 0) return;

  const cooldownMs = cfg.cooldown_minutes * 60 * 1000;

  for (const alert of alerts) {
    // Cooldown check per (host, reason) — covers BOTH channels at once.
    const recent = await env.DB.prepare(
      `SELECT sent_at FROM notification_log
        WHERE host = ? AND reason = ? AND sent_at > ?
        ORDER BY sent_at DESC LIMIT 1`,
    )
      .bind(alert.host, alert.reason, now - cooldownMs)
      .first<{ sent_at: number }>();
    if (recent) continue;

    const snap = await env.KV.get<ServerSnapshot>(SNAP_PREFIX + alert.host, 'json');
    const html = formatAlertHtml(alert, snap);
    const plain = formatAlertPlain(alert, snap);

    if (cfg.telegram_enabled && cfg.telegram_bot_token && cfg.telegram_chat_id) {
      try {
        await sendTelegram(cfg.telegram_bot_token, cfg.telegram_chat_id, html);
        await env.DB.prepare(
          'INSERT INTO notification_log (host, channel, reason, sent_at) VALUES (?,?,?,?)',
        ).bind(alert.host, 'telegram', alert.reason, Date.now()).run();
      } catch (e) {
        console.error('telegram send failed:', e);
      }
    }

    if (cfg.googlechat_enabled && cfg.googlechat_webhook_url) {
      try {
        await sendGoogleChat(cfg.googlechat_webhook_url, plain);
        await env.DB.prepare(
          'INSERT INTO notification_log (host, channel, reason, sent_at) VALUES (?,?,?,?)',
        ).bind(alert.host, 'googlechat', alert.reason, Date.now()).run();
      } catch (e) {
        console.error('googlechat send failed:', e);
      }
    }
  }
}
