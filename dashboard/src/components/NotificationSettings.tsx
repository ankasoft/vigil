import { ChevronDown, ChevronUp, Eye, EyeOff, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../api';
import type { NotificationLogEntry, NotificationSettings as Settings } from '../types';
import { formatRelative, reasonColor, reasonLabel } from '../utils';
import { toast } from './Toast';

const DEFAULT: Settings = {
  telegram_enabled: false,
  telegram_bot_token: '',
  telegram_chat_id: '',
  googlechat_enabled: false,
  googlechat_webhook_url: '',
  threshold_cpu: 85,
  threshold_ram: 85,
  threshold_disk: 90,
  alert_on_down: true,
  cooldown_minutes: 15,
};

export function NotificationSettings() {
  const [s, setS] = useState<Settings>(DEFAULT);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<NotificationLogEntry[]>([]);

  useEffect(() => {
    api.getSettings()
      .then((cfg) => { setS(cfg); setLoaded(true); })
      .catch((e) => toast('error', `Ayarlar yüklenemedi: ${e}`));
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const l = await api.notificationLog();
        if (alive) setLog(l);
      } catch { /* silent */ }
    };
    tick();
    const t = setInterval(tick, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.saveSettings(s);
      toast('success', 'Ayarlar kaydedildi');
      // Re-fetch to pick up new masked values.
      const cfg = await api.getSettings();
      setS(cfg);
    } catch (e) {
      toast('error', `Kaydedilemedi: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const test = async (channel: 'telegram' | 'googlechat') => {
    try {
      const r = await api.testChannel(channel);
      if (r.ok) toast('success', 'Test mesajı gönderildi');
      else toast('error', `Başarısız: ${r.error}`);
    } catch (e) {
      toast('error', String(e));
    }
  };

  if (!loaded) return <div className="card p-6 animate-pulse h-64" />;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-4">
        <TelegramPanel s={s} setS={setS} onTest={() => test('telegram')} />
        <GoogleChatPanel s={s} setS={setS} onTest={() => test('googlechat')} />
      </div>

      <ThresholdPanel s={s} setS={setS} />

      <div className="flex justify-end gap-2">
        <button className="btn" disabled={saving} onClick={save}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </button>
      </div>

      <NotificationLogTable log={log} />
    </div>
  );
}

// --- Telegram --------------------------------------------------------------

function TelegramPanel({ s, setS, onTest }: {
  s: Settings; setS: (s: Settings) => void; onTest: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <div className="card p-4 space-y-3">
      <Toggle
        label="Telegram"
        on={s.telegram_enabled}
        onChange={(v) => setS({ ...s, telegram_enabled: v })}
      />
      <div>
        <label className="label">Bot Token</label>
        <div className="flex gap-1">
          <input
            className="input"
            type={reveal ? 'text' : 'password'}
            value={s.telegram_bot_token}
            onChange={(e) => setS({ ...s, telegram_bot_token: e.target.value })}
            placeholder="123456:ABC..."
          />
          <button className="btn-secondary" onClick={() => setReveal(!reveal)} type="button">
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div>
        <label className="label">Chat ID</label>
        <input
          className="input"
          value={s.telegram_chat_id}
          onChange={(e) => setS({ ...s, telegram_chat_id: e.target.value })}
          placeholder="-100..."
        />
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onTest} type="button">
          <Send size={14} /> Test Gönder
        </button>
        <button className="btn-secondary" onClick={() => setHelp(!help)} type="button">
          {help ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Kurulum
        </button>
      </div>
      {help && (
        <ol className="text-xs text-slate-600 dark:text-slate-400 list-decimal pl-5 space-y-1">
          <li>Telegram'da <b>@BotFather</b> üzerinden yeni bot oluşturun → token'ı alın.</li>
          <li>Bildirim alacağınız grup/kanala botu ekleyin.</li>
          <li>Chat ID için: kanala bir mesaj atın, sonra
            <code className="mx-1 px-1 rounded bg-slate-200 dark:bg-slate-800">https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>
            adresinden chat id'yi okuyun (negatif sayı).
          </li>
        </ol>
      )}
    </div>
  );
}

// --- Google Chat -----------------------------------------------------------

function GoogleChatPanel({ s, setS, onTest }: {
  s: Settings; setS: (s: Settings) => void; onTest: () => void;
}) {
  const [reveal, setReveal] = useState(false);
  const [help, setHelp] = useState(false);
  return (
    <div className="card p-4 space-y-3">
      <Toggle
        label="Google Chat"
        on={s.googlechat_enabled}
        onChange={(v) => setS({ ...s, googlechat_enabled: v })}
      />
      <div>
        <label className="label">Webhook URL</label>
        <div className="flex gap-1">
          <input
            className="input"
            type={reveal ? 'text' : 'password'}
            value={s.googlechat_webhook_url}
            onChange={(e) => setS({ ...s, googlechat_webhook_url: e.target.value })}
            placeholder="https://chat.googleapis.com/v1/spaces/..."
          />
          <button className="btn-secondary" onClick={() => setReveal(!reveal)} type="button">
            {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="btn-secondary" onClick={onTest} type="button">
          <Send size={14} /> Test Gönder
        </button>
        <button className="btn-secondary" onClick={() => setHelp(!help)} type="button">
          {help ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Kurulum
        </button>
      </div>
      {help && (
        <ol className="text-xs text-slate-600 dark:text-slate-400 list-decimal pl-5 space-y-1">
          <li>Google Chat → Space → <b>Apps & integrations</b> menüsü.</li>
          <li><b>Webhooks → Add webhook</b> ile yeni webhook oluşturun.</li>
          <li>Üretilen URL'i yukarıdaki alana yapıştırın.</li>
        </ol>
      )}
    </div>
  );
}

// --- Thresholds ------------------------------------------------------------

function ThresholdPanel({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  return (
    <div className="card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Eşik değerleri</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        <NumberInput label="CPU eşiği (%)" value={s.threshold_cpu} min={0} max={100}
          onChange={(v) => setS({ ...s, threshold_cpu: v })} />
        <NumberInput label="RAM eşiği (%)" value={s.threshold_ram} min={0} max={100}
          onChange={(v) => setS({ ...s, threshold_ram: v })} />
        <NumberInput label="Disk eşiği (%)" value={s.threshold_disk} min={0} max={100}
          onChange={(v) => setS({ ...s, threshold_disk: v })} />
      </div>
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <NumberInput label="Cooldown (dakika)" value={s.cooldown_minutes} min={1} max={1440}
          onChange={(v) => setS({ ...s, cooldown_minutes: v })} />
        <Toggle
          label="Sunucu down olunca bildir"
          on={s.alert_on_down}
          onChange={(v) => setS({ ...s, alert_on_down: v })}
        />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Cooldown: aynı sunucu ve aynı sebep için bu süre boyunca tek bildirim atılır.
      </p>
    </div>
  );
}

function NumberInput({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <input
        type="number" className="input" value={value} min={min} max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n)));
        }}
      />
    </div>
  );
}

function Toggle({ label, on, onChange }: {
  label: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-3 cursor-pointer select-none">
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`w-10 h-6 rounded-full transition relative ${
          on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
        onClick={() => onChange(!on)}
        role="switch"
        aria-checked={on}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
          on ? 'translate-x-4' : ''
        }`} />
      </span>
    </label>
  );
}

// --- Log -------------------------------------------------------------------

function NotificationLogTable({ log }: { log: NotificationLogEntry[] }) {
  return (
    <div className="card">
      <h3 className="text-sm font-semibold p-4 pb-2">Son bildirimler</h3>
      {log.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">Henüz bildirim gönderilmedi.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="text-left px-4 py-2">Sunucu</th>
              <th className="text-left px-4 py-2">Kanal</th>
              <th className="text-left px-4 py-2">Sebep</th>
              <th className="text-right px-4 py-2">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {log.map((l) => (
              <tr key={l.id} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-4 py-2 font-mono text-xs">{l.host}</td>
                <td className="px-4 py-2 capitalize">{l.channel}</td>
                <td className="px-4 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${reasonColor[l.reason]}`}>
                    {reasonLabel[l.reason]}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs text-slate-500">
                  {formatRelative(l.sent_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
