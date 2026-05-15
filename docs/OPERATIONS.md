# İşletim Kılavuzu

Vigil çalıştıktan sonra yapacağınız ayar değişiklikleri, log temizliği ve genel sorun giderme.

## Eşik değerlerini değiştirme

Dashboard → **Ayarlar** sayfası. CPU/RAM/Disk eşikleri ve cooldown buradan değiştirilir;
değişiklik anında uygulanır (sonraki cron tick'inde).

## Worker `[vars]` ayarları

`worker/wrangler.toml` `[vars]` bölümü:

| Var | Default | Anlamı |
|---|---|---|
| `STALE_SECONDS` | `90` | KV snap'in `ts` alanı bu saniyeden eskiyse host **down** sayılır |
| `METRICS_RETENTION_HOURS` | `24` | D1 `metrics` tablosunda saklanan saat sayısı |

Değiştirip `wrangler deploy` yapın. Bunlar **public** vars'tır (secret değil).

## Saklama süreleri

| Veri | Yer | Saklama |
|---|---|---|
| Latest snapshot (cache) | KV `snap:*` | **120 s** (TTL) |
| Metrik geçmişi | D1 `metrics` | `METRICS_RETENTION_HOURS` (default 24 h) |
| Bildirim logu | D1 `notification_log` | **30 gün** (cron'da sabit) |
| Bilinen host kaydı | D1 `hosts` | Sınırsız (silinmez; `last_seen` ile filtrelenir) |

Değiştirme:
- Metrik retention: `wrangler.toml`'da `METRICS_RETENTION_HOURS`.
- Log retention: `worker/src/index.ts` içinde `runCron` fonksiyonundaki `30 * 24 * 3600 * 1000` sabiti.
- Eski host'u tamamen sil:
  ```bash
  wrangler d1 execute vigil --remote \
    --command "DELETE FROM hosts WHERE host='eski-srv'; \
               DELETE FROM metrics WHERE host='eski-srv';"
  ```

## API_KEY rotasyonu

1. Yeni key oluştur, `wrangler secret put API_KEY` ile yaz.
2. Her agent host'unda `/etc/vigil-agent.env` içindeki `VIGIL_KEY` değerini güncelle.
3. `sudo systemctl restart vigil-agent`.

Aralık olmaması için: önce tüm agent'ları güncelle (eski key hâlâ kabul ediliyor olur),
sonra worker'da yeniyi set et ve **eski agent'ların kaldığını `journalctl`'den doğrula**.

> Çoklu key desteklenmiyor; rotasyon esnasında kısa bir gap kabul ediliyorsa daha kolay.

## ADMIN_TOKEN rotasyonu

1. Yeni token oluştur, `wrangler secret put ADMIN_TOKEN` ile yaz.
2. Aktif dashboard tab'leri bir sonraki API çağrısında 401 alır → login modal otomatik açılır.
3. Yeni token'ı yapıştır.

Çoklu kullanıcıda yeni değeri tüm kullanıcılara güvenli kanaldan dağıtın. Detay:
[AUTH.md](AUTH.md).

## Polling aralıkları (dashboard)

| Endpoint | Aralık | Component |
|---|---|---|
| `/api/servers` | 15 s | `ServerGrid` |
| `/api/alerts` | 30 s | `AlertBanner` |
| `/api/history/:host` | 15 s | `ServerDetail` (modal açıkken) |
| `/api/notification/log` | 60 s | `NotificationSettings` |

Değiştirmek için ilgili component'in `useEffect` içindeki `setInterval` değerini düzenleyin.

## Worker quota

Free tier sınırları (yaklaşık):
- 100k istek/gün
- D1: 5M okuma + 100k yazma/gün
- KV: 100k okuma + 1k yazma/gün **per namespace** — KV writes kritik sınır.

Tek agent 15s'de 1 KV write → günde **5760 write**. 100 agent → 576k → free tier üstü.
Çözüm: KV writes'i azaltmak için `INTERVAL`'ı artırın (örn. 30s → yarıya düşer).

## Log analizi

```bash
# Worker logları
wrangler tail

# Agent logları (host üzerinde)
sudo journalctl -u vigil-agent -f
sudo journalctl -u vigil-agent --since "1 hour ago"
```

## Veritabanı sorgu örnekleri

```bash
# Son 1 saatte en yüksek CPU peak'leri
wrangler d1 execute vigil --remote --command "
  SELECT host, MAX(cpu_max) AS peak
  FROM metrics
  WHERE ts > (strftime('%s','now')-3600)*1000
  GROUP BY host
  ORDER BY peak DESC
  LIMIT 10;
"

# Bilinen tüm host'lar ve son rapor zamanı
wrangler d1 execute vigil --remote --command "
  SELECT host, ip, os, datetime(last_seen/1000,'unixepoch') AS last
  FROM hosts ORDER BY last DESC;
"

# Son 24 saatte tetiklenen bildirimler
wrangler d1 execute vigil --remote --command "
  SELECT host, reason, channel, datetime(sent_at/1000,'unixepoch') AS at
  FROM notification_log
  WHERE sent_at > (strftime('%s','now')-86400)*1000
  ORDER BY sent_at DESC;
"
```

## Yedekleme

D1 export:
```bash
wrangler d1 export vigil --remote --output backup-$(date +%F).sql
```

Geri yükleme:
```bash
wrangler d1 execute vigil --remote --file=backup-2026-05-15.sql
```

## Eski metric satırlarını manuel temizleme

Cron her saat başı otomatik temizlik yapar; manuel:
```bash
wrangler d1 execute vigil --remote --command "
  DELETE FROM metrics WHERE ts < (strftime('%s','now')-86400)*1000;
"
```

## Tipik sorun çözüm yolları

| Belirti | Olası neden / çözüm |
|---|---|
| Dashboard'da hiç host yok | Worker deploy yapılmamış, ya da agent'lar henüz ilk POST atmadı |
| Host kart olarak görünüyor ama tüm metrikler 0 | İlk POST gecikmiş — bir INTERVAL bekleyin |
| Dashboard yavaş | KV `Promise.all` ile çoklu okuma yapıyor; çok sayıda host (>200) için sorun olabilir |
| Down alarmı yanlış pozitif | `STALE_SECONDS`'ı 90 → 120 yapın, ya da agent INTERVAL'i 15 → 10'a indirin |
| Aynı host iki kart oluşturuyor | Hostname değişmiş ya da iki yerde aynı script çalışıyor — agent host'unda `hostname` kontrol edin |
| Wrangler `D1_ERROR: too many SQL variables` | Migration dosyasını parçalayın veya tek seferde 100'den fazla insert yapmayın |

## Güncelleme

```bash
git pull
cd worker && npm install && npm run db:migrate:remote && wrangler deploy
cd ../dashboard && npm install && npm run build   # Pages otomatik deploy ederse atlanabilir
# Agent'lar için: install.sh'ı yeniden çalıştırın (idempotent)
```

Şema değişikliği varsa migration dosyası eklenmiştir; `npm run db:migrate:remote` idempotent
olarak çalıştırır (CREATE IF NOT EXISTS).
