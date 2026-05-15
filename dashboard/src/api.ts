/**
 * Typed API client for the Vigil Worker.
 *
 * Auth: admin token from localStorage is sent as X-Admin-Token on every call.
 * On 401 we dispatch a window event so AuthProvider can re-open the login modal.
 */

import { TOKEN_KEY, UNAUTHORIZED_EVENT } from './auth';
import type {
  Alert,
  HistoryPoint,
  NotificationLogEntry,
  NotificationSettings,
  ServerRow,
} from './types';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

async function jsonFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const r = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'X-Admin-Token': token } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (r.status === 401) {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    throw new Error('unauthorized');
  }
  if (!r.ok) {
    throw new Error(`${r.status} ${r.statusText}: ${await r.text().catch(() => '')}`);
  }
  return r.json() as Promise<T>;
}

export const api = {
  servers: () => jsonFetch<ServerRow[]>('/api/servers'),

  history: (host: string) =>
    jsonFetch<HistoryPoint[]>(`/api/history/${encodeURIComponent(host)}`),

  alerts: () => jsonFetch<Alert[]>('/api/alerts'),

  getSettings: () => jsonFetch<NotificationSettings>('/api/notification/settings'),

  saveSettings: (s: NotificationSettings) =>
    jsonFetch<{ ok: true }>('/api/notification/settings', {
      method: 'PUT',
      body: JSON.stringify(s),
    }),

  testChannel: (channel: 'telegram' | 'googlechat') =>
    jsonFetch<{ ok: boolean; error?: string }>(
      `/api/notification/test/${channel}`,
      { method: 'POST' },
    ),

  notificationLog: () =>
    jsonFetch<NotificationLogEntry[]>('/api/notification/log'),
};
