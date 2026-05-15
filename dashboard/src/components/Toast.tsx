/** Minimal toast system — no provider, just a global event queue. */

import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

type ToastKind = 'success' | 'error';
interface Toast { id: number; kind: ToastKind; message: string; }

let nextId = 1;
const listeners = new Set<(t: Toast) => void>();

export function toast(kind: ToastKind, message: string) {
  const t: Toast = { id: nextId++, kind, message };
  listeners.forEach((fn) => fn(t));
}

export function ToastHost() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const fn = (t: Toast) => {
      setItems((s) => [...s, t]);
      setTimeout(() => setItems((s) => s.filter((i) => i.id !== t.id)), 4000);
    };
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[60] space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg text-sm
                      ${t.kind === 'success'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 text-white'}`}
        >
          {t.kind === 'success' ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {t.message}
        </div>
      ))}
    </div>
  );
}
