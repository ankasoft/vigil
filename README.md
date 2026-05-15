# Vigil — *stay vigilant*

Açık kaynaklı, sıfır bağımlılıklı, hafif Linux sunucu izleme sistemi.
Cloudflare Workers + D1 + KV üzerinde çalışır; ölçeklenir, sunucu işletmen gerekmez.

```
   ┌────────────┐        HTTPS         ┌──────────────────┐         ┌──────────────┐
   │  Agent(s)  │   POST /api/ingest   │  Cloudflare      │  fetch  │  Dashboard   │
   │  (Python)  │ ───────────────────▶ │  Worker          │ ◀────── │  (React SPA) │
   │  systemd   │                      │  + KV + D1       │         │  CF Pages    │
   └────────────┘                      │  + Cron (1m)     │         └──────────────┘
                                       └────────┬─────────┘
                                                │
                                                ▼  (down / threshold)
                                   Telegram   |   Google Chat
```

## Bileşenler

| Klasör | Ne | Çalıştığı yer |
|---|---|---|
| `agent/`     | Python 3.8+ stdlib agent + systemd unit | İzlenen sunucu |
| `worker/`    | Hono + D1 + KV API + cron alerts        | Cloudflare Workers |
| `dashboard/` | Vite + React + Tailwind SPA             | Cloudflare Pages |
| `docs/`      | Kurulum dokümanları                     | — |

## Hızlı başlangıç

> Adım adım yönergeler için **[docs/INSTALL.md](docs/INSTALL.md)** dosyasına bakın.

```bash
# 1. Worker'ı deploy et
cd worker
npm install
wrangler kv namespace create vigil-kv          # id'yi wrangler.toml'a yaz
wrangler d1 create vigil                       # id'yi wrangler.toml'a yaz
npm run db:migrate:remote
wrangler secret put API_KEY                    # uzun rastgele string (agent'lar için)
wrangler secret put ADMIN_TOKEN                # uzun rastgele string (dashboard için)
wrangler deploy

# 2. Dashboard'u deploy et (Cloudflare Pages)
cd ../dashboard
npm install
# VITE_API_URL'i Pages env'ine ekle: https://vigil.<your>.workers.dev
npm run build
# CF Pages: build cmd `npm run build`, dist `dist/`

# 3. Agent'ı bir sunucuya kur
curl -fsSL https://raw.githubusercontent.com/ankasoft/vigil/main/agent/install.sh \
  | sudo bash -s -- --key YOUR_API_KEY --hub https://vigil.<your>.workers.dev
```

## Özellikler

- **Spike algılama**: Agent 3s'de örnekler, 15s'de current/max/avg raporlar — kısa spike'lar kaçmaz.
- **Çoklu mount disk takibi**: Her filesystem ayrı; `/` özetlenir.
- **Bildirimler**: Telegram + Google Chat, host+sebep başına cooldown.
- **Basit auth**: Admin token (login modal) + agent API key. Cloudflare Access gerekmez.
- **D1 saklama**: 24 saat metrik geçmişi, 30 gün bildirim logu.
- **Düşük yük**: Agent ~0.05% CPU, ~12 MB RAM. Pi Zero üzerinde bile.

## Dokümantasyon

- [docs/INSTALL.md](docs/INSTALL.md) — Kurulum başlangıç sayfası
- [docs/WORKER.md](docs/WORKER.md) — Worker (API + cron) deploy
- [docs/DASHBOARD.md](docs/DASHBOARD.md) — Dashboard (Pages) deploy
- [docs/AGENT.md](docs/AGENT.md) — Agent kurulum & sorun giderme
- [docs/AUTH.md](docs/AUTH.md) — API_KEY ve ADMIN_TOKEN
- [docs/NOTIFICATIONS.md](docs/NOTIFICATIONS.md) — Telegram & Google Chat
- [docs/OPERATIONS.md](docs/OPERATIONS.md) — Eşik değiştirme, log temizliği, sorun giderme

## Katkı

PR'lar açıktır. Lütfen değişikliğin etkilediği `docs/` dosyalarını da güncelleyin —
kurulum/operasyon davranışı değişiyorsa doküman senkron kalmalı.

## Lisans

MIT.
