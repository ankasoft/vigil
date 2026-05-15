import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ServerRow } from '../types';
import { AlertBanner } from './AlertBanner';
import { ServerCard } from './ServerCard';
import { ServerDetail } from './ServerDetail';

export function ServerGrid() {
  const [servers, setServers] = useState<ServerRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const s = await api.servers();
        if (alive) { setServers(s); setErr(null); }
      } catch (e) {
        if (alive) setErr(String(e));
      }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (err && servers === null) {
    return <div className="card p-6 text-red-600">Bağlanılamadı: {err}</div>;
  }

  if (servers === null) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-4 animate-pulse h-40" />
        ))}
      </div>
    );
  }

  const total = servers.length;
  const offline = servers.filter((s) => !s.online).length;
  const warn = servers.filter((s) => s.online &&
    (s.snapshot && (
      (s.snapshot.cpu_max ?? s.snapshot.cpu) >= 75 ||
      (s.snapshot.ram_max ?? s.snapshot.ram) >= 75 ||
      s.snapshot.disk_root >= 75
    ))).length;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 text-sm">
        <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800">
          Toplam: <b className="ml-1">{total}</b>
        </span>
        <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">
          Uyarı: <b className="ml-1">{warn}</b>
        </span>
        <span className="px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
          Offline: <b className="ml-1">{offline}</b>
        </span>
      </div>

      <AlertBanner />

      {total === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          Henüz hiçbir sunucu rapor göndermedi. Bir sunucuya agent kurun ve birkaç dakika bekleyin.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {servers.map((s) => (
            <ServerCard key={s.host} server={s} onClick={() => setSelected(s.host)} />
          ))}
        </div>
      )}

      {selected && (
        <ServerDetail
          host={selected}
          server={servers.find((s) => s.host === selected) ?? null}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
