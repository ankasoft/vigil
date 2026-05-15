import { Cpu, HardDrive, MemoryStick, Network, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { HistoryPoint, ServerRow } from '../types';
import { formatUptime } from '../utils';
import { SparkChart } from './SparkChart';

interface Props {
  host: string;
  server: ServerRow | null;
  onClose: () => void;
}

export function ServerDetail({ host, server, onClose }: Props) {
  const [history, setHistory] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const h = await api.history(host);
        if (alive) setHistory(h);
      } catch { /* silent */ }
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [host]);

  const snap = server?.snapshot;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-5xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${
                server?.online ? 'bg-emerald-500' : 'bg-slate-400'
              }`} />
              {host}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {server?.ip ?? '—'} · {server?.os ?? '—'}
            </p>
          </div>
          <button onClick={onClose} className="btn-secondary !p-2" aria-label="close">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Summary tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <Tile icon={<Cpu size={14} />} label="CPU"
                  value={snap ? `${snap.cpu.toFixed(0)}%` : '—'}
                  sub={snap ? `peak ${snap.cpu_max.toFixed(0)}%` : ''} />
            <Tile icon={<MemoryStick size={14} />} label="RAM"
                  value={snap ? `${snap.ram.toFixed(0)}%` : '—'}
                  sub={snap ? `${snap.ram_total_mb} MB toplam` : ''} />
            <Tile icon={<HardDrive size={14} />} label="Disk /"
                  value={snap ? `${snap.disk_root.toFixed(0)}%` : '—'} />
            <Tile icon={<Network size={14} />} label="Net IN/OUT"
                  value={snap ? `${snap.net_in.toFixed(0)} / ${snap.net_out.toFixed(0)}` : '—'}
                  sub="KB/s" />
            <Tile label="Load"
                  value={snap ? `${snap.load1}` : '—'}
                  sub={snap ? `${snap.load5} / ${snap.load15}` : ''} />
            <Tile label="Uptime" value={snap ? formatUptime(snap.uptime) : '—'} />
          </div>

          {/* Charts */}
          {history === null ? (
            <div className="card p-6 animate-pulse h-72" />
          ) : history.length === 0 ? (
            <div className="card p-6 text-center text-slate-500">Henüz veri yok.</div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <ChartCard title="CPU (%)">
                <SparkChart
                  data={history}
                  yDomain={[0, 100]}
                  unit="%"
                  series={[
                    { key: 'cpu_avg', color: '#0ea5e9', name: 'avg' },
                    { key: 'cpu_max', color: '#dc2626', name: 'peak', dashed: true },
                  ]}
                />
              </ChartCard>
              <ChartCard title="RAM (%)">
                <SparkChart
                  data={history}
                  yDomain={[0, 100]}
                  unit="%"
                  series={[
                    { key: 'ram_avg', color: '#8b5cf6', name: 'avg' },
                    { key: 'ram_max', color: '#dc2626', name: 'peak', dashed: true },
                  ]}
                />
              </ChartCard>
              <ChartCard title="Network (KB/s)">
                <SparkChart
                  data={history}
                  unit=""
                  series={[
                    { key: 'net_in', color: '#10b981', name: 'in' },
                    { key: 'net_out', color: '#f59e0b', name: 'out' },
                  ]}
                />
              </ChartCard>
              <ChartCard title="Disk / (%)">
                <SparkChart
                  data={history}
                  yDomain={[0, 100]}
                  unit="%"
                  series={[{ key: 'disk_root', color: '#0ea5e9', name: '/' }]}
                />
              </ChartCard>
            </div>
          )}

          {/* All mounts */}
          {snap && snap.disks && snap.disks.length > 1 && (
            <div className="card p-4">
              <h3 className="text-sm font-semibold mb-2">Tüm mountlar</h3>
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-500">
                  <tr><th className="text-left py-1">Mount</th>
                      <th className="text-right">%</th>
                      <th className="text-right">Kullanılan</th>
                      <th className="text-right">Toplam</th></tr>
                </thead>
                <tbody>
                  {snap.disks.map((d) => (
                    <tr key={d.mount} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1 font-mono text-xs">{d.mount}</td>
                      <td className="text-right tabular-nums">{d.pct.toFixed(1)}</td>
                      <td className="text-right tabular-nums">{d.used_gb} GB</td>
                      <td className="text-right tabular-nums">{d.total_gb} GB</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tile({ icon, label, value, sub }: {
  icon?: React.ReactNode; label: string; value: string; sub?: string;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        {icon}{label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card p-3">
      <h3 className="text-sm font-semibold mb-2">{title}</h3>
      {children}
    </div>
  );
}
