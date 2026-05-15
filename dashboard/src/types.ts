/** Single mounted filesystem snapshot. */
export interface DiskMount {
  mount: string;
  pct: number;
  used_gb: number;
  total_gb: number;
}

/** Latest snapshot the worker has for one host (what /api/ingest stored). */
export interface MetricSnapshot {
  host: string;
  ip?: string;
  os?: string;
  ts: number;

  cpu: number;
  cpu_max: number;
  cpu_avg: number;

  ram: number;
  ram_max: number;
  ram_avg: number;
  ram_total_mb: number;

  disk_root: number;
  disks: DiskMount[];

  net_in: number;
  net_out: number;
  load1: number;
  load5: number;
  load15: number;
  uptime: number;
}

/** /api/servers row — combines hosts row + KV snapshot. */
export interface ServerRow {
  host: string;
  ip: string | null;
  os: string | null;
  ram_total_mb: number | null;
  first_seen: number;
  last_seen: number;
  online: boolean;
  snapshot: MetricSnapshot | null;
}

/** /api/history/:host row. */
export interface HistoryPoint {
  ts: number;
  cpu: number;
  cpu_max: number;
  cpu_avg: number;
  ram: number;
  ram_max: number;
  ram_avg: number;
  disk_root: number;
  disks: DiskMount[];
  net_in: number;
  net_out: number;
  load1: number;
}

export type AlertReason = 'down' | 'high_cpu' | 'high_ram' | 'high_disk';

export interface Alert {
  host: string;
  reason: AlertReason;
  value?: number;
  threshold?: number;
}

/** Notification settings — secret fields come back masked (•••• + last 4 chars). */
export interface NotificationSettings {
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  googlechat_enabled: boolean;
  googlechat_webhook_url: string;
  threshold_cpu: number;
  threshold_ram: number;
  threshold_disk: number;
  alert_on_down: boolean;
  cooldown_minutes: number;
}

export interface NotificationLogEntry {
  id: number;
  host: string;
  channel: 'telegram' | 'googlechat';
  reason: AlertReason;
  sent_at: number;
}
