# Kurulum — Genel Bakış

Vigil'in tam kurulumu için **üç aşama** gerekir. Sırayla takip edin:

| # | Aşama | Süre | Doküman |
|---|---|---|---|
| 1 | Cloudflare Worker (API + cron) | ~10 dk | [WORKER.md](WORKER.md) |
| 2 | Dashboard (Cloudflare Pages) | ~5 dk | [DASHBOARD.md](DASHBOARD.md) |
| 3 | Agent (her sunucuda) | <1 dk / sunucu | [AGENT.md](AGENT.md) |

Referans:
- [AUTH.md](AUTH.md) — API_KEY ve ADMIN_TOKEN'ın ne olduğu, nasıl üretilir/rotasyon yapılır
- [NOTIFICATIONS.md](NOTIFICATIONS.md) — Telegram & Google Chat bildirimleri
- [OPERATIONS.md](OPERATIONS.md) — Eşik değiştirme, log temizliği, sorun giderme

---

## Ön gereksinimler

- **Cloudflare hesabı** (ücretsiz tier yeterli — Workers + KV + D1 + Pages + Access)
- **Node.js 18+** (yerel makine — Wrangler ve dashboard build için)
- **wrangler CLI** — `npm install -g wrangler` veya `npx wrangler`
- **bash & curl** (agent kurulumu için, izlenen Linux sunucularda)
- **Python 3.8+** (izlenen Linux sunucularda — neredeyse her dağıtımda var)

---

## Mimari özeti

```
   ┌──────────────┐       (1) POST /api/ingest        ┌─────────────────────┐
   │   Agent(s)   │  X-API-Key: YOUR_API_KEY          │   Cloudflare Worker │
   │   Python     │  ─────────────────────────────▶   │   (Hono + D1 + KV)  │
   │   systemd    │  every INTERVAL seconds           │   cron: every 1 min │
   └──────────────┘                                   └──────────┬──────────┘
                                                                 │
                       (2) GET /api/servers, /api/history, ...   │
   ┌──────────────┐    X-Admin-Token: YOUR_ADMIN_TOKEN           │
   │   Dashboard  │  ◀───────────────────────────────────────────┘
   │  React SPA   │     (admin token sorulur, localStorage'da tutulur)
   │  CF Pages    │
   └──────────────┘
                              (3) on threshold/down
                              ┌──────────────────────┐
                              │  Telegram / GChat    │
                              └──────────────────────┘
```

İki ayrı **paylaşılan secret** vardır:

1. **Agent → Worker**: `API_KEY` (`X-API-Key` header) — sadece `/api/ingest`'i açar.
2. **Tarayıcı/Admin → Worker**: `ADMIN_TOKEN` (`X-Admin-Token` header) — diğer tüm `/api/*` endpoint'lerini açar.

Detay: [AUTH.md](AUTH.md).

---

## Sırada ne var?

➡️  [WORKER.md](WORKER.md) ile başlayın.
