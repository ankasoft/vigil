import { Activity, Cpu, HardDrive, MemoryStick } from 'lucide-react';
import { displayName, useAliases } from '../aliases';
import type { ServerRow } from '../types';
import { formatRelative, formatUptime, levelColor } from '../utils';

interface Props {
  server: ServerRow;
  onClick: () => void;
}

function Bar({ label, value, online, icon }: {
  label: string;
  value: number;
  online: boolean;
  icon: React.ReactNode;
}) {
  const c = levelColor(value, online);
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
          {icon}
          {label}
        </span>
        <span className={`tabular-nums font-medium ${c.text}`}>
          {online ? `${value.toFixed(0)}%` : '—'}
        </span>
      </div>
      <div className={`h-1.5 rounded-full overflow-hidden ${c.bg}`}>
        <div
          className={`h-full ${c.bar} transition-all`}
          style={{ width: `${online ? Math.min(100, value) : 0}%` }}
        />
      </div>
    </div>
  );
}

export function ServerCard({ server, onClick }: Props) {
  const s = server.snapshot;
  const online = server.online;
  const aliases = useAliases();
  const name = displayName(server.host, aliases);
  const aliased = name !== server.host;

  const cpu = s?.cpu_max ?? s?.cpu ?? 0;
  const ram = s?.ram_max ?? s?.ram ?? 0;
  const disk = s?.disk_root ?? 0;

  return (
    <button
      onClick={onClick}
      className="card p-4 text-left hover:shadow-md transition cursor-pointer
                 hover:border-slate-300 dark:hover:border-slate-700"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${
              online ? 'bg-emerald-500' : 'bg-slate-400'
            }`} />
            <h3 className="font-semibold truncate">{name}</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            {aliased ? <span className="font-mono">{server.host}</span> : (server.ip ?? '—')}
            {!aliased && server.os ? ` · ${server.os}` : ''}
            {aliased && server.ip ? ` · ${server.ip}` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 dark:text-slate-400 shrink-0 ml-2">
          {online ? (
            <>
              <div>up {formatUptime(s?.uptime ?? 0)}</div>
              <div className="flex items-center gap-1 justify-end mt-0.5">
                <Activity size={10} />
                {s?.load1.toFixed(2)}
              </div>
            </>
          ) : (
            <div className="text-slate-400">
              {formatRelative(server.last_seen)}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2.5">
        <Bar label="CPU" value={cpu} online={online} icon={<Cpu size={12} />} />
        <Bar label="RAM" value={ram} online={online} icon={<MemoryStick size={12} />} />
        <Bar label="Disk /" value={disk} online={online} icon={<HardDrive size={12} />} />
      </div>
    </button>
  );
}
