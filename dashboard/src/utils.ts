/** Small UI helpers — formatting, color decisions, etc. */

export function formatUptime(seconds: number): string {
  if (seconds <= 0) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}g ${h}s`;
  if (h > 0) return `${h}s ${m}d`;
  return `${m}d`;
}

export function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s} sn önce`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} dk önce`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} sa önce`;
  return `${Math.floor(h / 24)} gün önce`;
}

export function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Tailwind class fragment for an absolute metric percentage. */
export function levelColor(pct: number, online = true): {
  bar: string; text: string; bg: string;
} {
  if (!online) return { bar: 'bg-slate-400', text: 'text-slate-500', bg: 'bg-slate-200 dark:bg-slate-800' };
  if (pct >= 90) return { bar: 'bg-red-500',   text: 'text-red-600',   bg: 'bg-red-100 dark:bg-red-900/30' };
  if (pct >= 75) return { bar: 'bg-amber-500', text: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30' };
  return            { bar: 'bg-emerald-500', text: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30' };
}

export const reasonLabel: Record<string, string> = {
  down: 'DOWN',
  high_cpu: 'HIGH CPU',
  high_ram: 'HIGH RAM',
  high_disk: 'HIGH DISK',
};

export const reasonColor: Record<string, string> = {
  down: 'bg-slate-700 text-white',
  high_cpu: 'bg-red-600 text-white',
  high_ram: 'bg-amber-600 text-white',
  high_disk: 'bg-amber-700 text-white',
};
