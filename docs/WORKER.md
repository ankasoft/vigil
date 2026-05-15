# Worker Kurulumu

Cloudflare Worker; API endpoint'leri, alert cron job'ı ve veritabanı bağlantılarını barındırır.

## 1. Bağımlılıkları yükle

```bash
cd worker
npm install
```

Eğer `wrangler` global değilse `npx wrangler ...` ile çalıştırın.

## 2. Cloudflare login

```bash
wrangler login
```
Tarayıcı açılır, hesabını yetkilendir.

## 3. KV namespace oluştur

```bash
wrangler kv namespace create vigil-kv
```

Çıktıdaki `id` değerini al:
```
🌀  Creating namespace with title "vigil-vigil-kv"
✨  Success!
[[kv_namespaces]]
binding = "KV"
id = "abc123def456..."
```

`worker/wrangler.toml` içindeki `REPLACE_WITH_KV_ID` satırını bu id ile değiştir.

## 4. D1 veritabanı oluştur

```bash
wrangler d1 create vigil
```

Çıktıdaki `database_id` değerini al ve `wrangler.toml` içindeki `REPLACE_WITH_D1_ID` satırını değiştir.

## 5. Şemayı uygula

Üç migration var: `0001_init.sql` (metrik geçmişi), `0002_notifications.sql` (bildirim ayar+log),
`0003_hosts.sql` (bilinen sunucu kaydı).

```bash
npm run db:migrate:remote
```

> `db:migrate` (suffix'siz) local D1 üzerinde çalışır — `wrangler dev` testi için.

## 6. Secret'ları ata

İki paylaşılan secret gerekli — detay için [AUTH.md](AUTH.md):

| Secret | Amaç |
|---|---|
| `API_KEY` | Agent → Worker doğrulaması (`X-API-Key`) |
| `ADMIN_TOKEN` | Dashboard → Worker doğrulaması (`X-Admin-Token`) |

Her ikisi de **uzun ve rastgele** olmalı:

```bash
# API_KEY (her agent host'unda saklanacak)
openssl rand -hex 32 | wrangler secret put API_KEY

# ADMIN_TOKEN (dashboard login modalına gireceğiniz değer)
openssl rand -hex 32 | wrangler secret put ADMIN_TOKEN
```

İki değeri de bir parola yöneticisine kaydedin.

## 7. (Opsiyonel) Eşik / saklama değerlerini ayarla

`wrangler.toml` içindeki `[vars]` bölümü:

```toml
[vars]
STALE_SECONDS = "90"                # KV'de kayıt olsa bile bu süreden eskiyse down sayılır
METRICS_RETENTION_HOURS = "24"      # D1 metrik geçmişi tutma süresi (saat)
```

Bunlar **public** vars (secret değil). Değiştirip tekrar `wrangler deploy` çalıştır.

## 8. Deploy

```bash
wrangler deploy
```

Çıktı:
```
Total Upload: 78.43 KiB / gzip: 21.10 KiB
Uploaded vigil (4.21 sec)
Published vigil (5.02 sec)
  https://vigil.<your-account>.workers.dev
  ...
Current Deployment ID: ...
```

URL'i kaydedin — dashboard `VITE_API_URL`, agent `HUB_URL` olarak kullanılacak.

## 9. Doğrulama

```bash
# Auth olmadan /api/servers reddedilmeli
curl https://vigil.<your-account>.workers.dev/api/servers
# → {"error":"unauthorized"}

# ADMIN_TOKEN ile boş array dönmeli (henüz agent yok)
curl -H "X-Admin-Token: YOUR_ADMIN_TOKEN" \
  https://vigil.<your-account>.workers.dev/api/servers
# → []

# Auth olmadan ingest reddedilmeli
curl -X POST https://vigil.<your-account>.workers.dev/api/ingest \
  -d '{}'
# → {"error":"unauthorized"}
```

## 10. Cron'u doğrula

```bash
wrangler tail
```
Her dakika `scheduled` invocation görmelisin.

---

## Sırada

➡️  [DASHBOARD.md](DASHBOARD.md) — Pages deploy + ilk giriş.

## Güncelleme

Kod değişikliğinden sonra:

```bash
cd worker
git pull
npm install
# Şema değiştiyse:
npm run db:migrate:remote
wrangler deploy
```

## Hata ayıklama

| Sorun | Bakılacak yer |
|---|---|
| `D1_ERROR: no such table` | `npm run db:migrate:remote` çalıştırılmamış |
| Cron çalışmıyor | `wrangler tail` — `[triggers] crons = ["* * * * *"]` doğrula |
| 401 ingest | secret eksik veya yanlış — `wrangler secret put API_KEY` |
| Dashboard 401 | `ADMIN_TOKEN` set edilmemiş — `wrangler secret put ADMIN_TOKEN`. Sonra dashboard'da çıkış → tekrar giriş |
