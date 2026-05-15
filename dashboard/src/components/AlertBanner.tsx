import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Alert } from '../types';
import { reasonColor, reasonLabel } from '../utils';

export function AlertBanner() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const a = await api.alerts();
        if (alive) setAlerts(a);
      } catch { /* silent */ }
    };
    tick();
    const t = setInterval(tick, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const keyOf = (a: Alert) => `${a.host}:${a.reason}`;
  const visible = alerts.filter((a) => !dismissed.has(keyOf(a)));
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 space-y-1.5">
      {visible.map((a) => (
        <div
          key={keyOf(a)}
          className={`flex items-center gap-3 px-4 py-2 rounded-lg
                      ${reasonColor[a.reason]} shadow-sm`}
        >
          <AlertTriangle size={16} className="shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-semibold mr-2">{reasonLabel[a.reason]}</span>
            <span className="opacity-90">{a.host}</span>
            {a.value !== undefined && a.threshold !== undefined && (
              <span className="opacity-90 ml-2">
                — {a.value.toFixed(1)}% (eşik {a.threshold}%)
              </span>
            )}
          </div>
          <button
            onClick={() => setDismissed((d) => new Set(d).add(keyOf(a)))}
            className="opacity-80 hover:opacity-100"
            aria-label="dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
