# Vigil — Implementation Plan

Spec'e (PRD.md) ek olarak, 4 kritik karar sonrası alınan yol.

---

## Kararlar özeti

| Konu | Karar |
|---|---|
| Dashboard auth | İki Worker secret'ı: API_KEY (agent) + ADMIN_TOKEN (UI). Dashboard login modal ile token alır, localStorage'da tutar. CF Access kullanılmaz. |
| Down detection | D1'de `hosts` tablosu; ingest'te upsert, cron oradan okur |
| IP / OS | Agent toplar, D1 `hosts` tablosuna persist |
| Disk | Tüm mountlar JSON; `disk_root` ayrıca flat kolon olarak |
| Spike algılama | Oversample + aggregate: agent 3s'de örnekler, 15s'de current+max+avg raporlar |

---

## 1. Veri modeli değişiklikleri

### `0001_init.sql` (revize)
`metrics` tablosu, PRD'deki kolonlara ek olarak:
- `cpu` → anlık (raporlama anındaki son örnek)
- `cpu_max REAL`, `cpu_avg REAL` — son 15s penceresinde
- `ram` → anlık
- `ram_max REAL`, `ram_avg REAL` — son 15s penceresinde
- `disk_root REAL` (mevcut, anlık)
- `disks_json TEXT` — `[{"mount":"/","pct":42.1,"used_gb":18.2,"total_gb":50},...]`

`load1/5/15`, `net_in/out`, `uptime` için aggregate tutmuyoruz; load zaten kernel tarafından smoothed.

### `0002_notifications.sql`
Değişiklik yok (PRD'deki gibi).

### `0003_hosts.sql` (yeni)
```sql
CREATE TABLE hosts (
  host TEXT PRIMARY KEY,
  ip TEXT,
  os TEXT,
  ram_total_mb INTEGER,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
```
Ingest'te: `INSERT ... ON CONFLICT(host) DO UPDATE SET ip=?, os=?, ram_total_mb=?, last_seen=?`.

---

## 2. Worker güncellemeleri

### Auth modeli
- `/api/ingest` → X-API-Key (agent → worker, `API_KEY` secret)
- Diğer tüm `/api/*` → X-Admin-Token (dashboard → worker, `ADMIN_TOKEN` secret), Hono middleware ile doğrulanır
- Dashboard `auth.tsx` modal'ı ilk açılışta token sorar, localStorage'da `vigil_admin_token` olarak tutar
- 401 dönerse `vigil:unauthorized` window event'i atılır, modal yeniden açılır
- CORS: `Access-Control-Allow-Origin: *` + `X-API-Key`, `X-Admin-Token` header'ları izinli
- `GET /api/notification/settings` masked döner (defense-in-depth)
- Cloudflare Access kullanılmaz; ileride istenirse ek bir kapı olarak eklenebilir ([AUTH.md](docs/AUTH.md))

### Cron handler — yeni akış
1. `SELECT host, last_seen FROM hosts WHERE last_seen > now - 24h`
2. KV multi-get `snap:{host}` her host için
3. KV'de yoksa **veya** snap.ts < now - 90s → `down`
4. Aksi halde threshold kontrolleri (cpu/ram/disk_root)
5. Cooldown sorgusu → kanallara gönder → `notification_log` insert

### `/api/servers` response zenginleşmesi
KV `snap:*` + D1 `hosts` join (her snapshot için tek sorgu yerine `IN(...)` tek sorgu). Response'a `ip`, `os` eklenir; `disks` JSON parse edilip array olarak döner.

---

## 3. Agent (`agent.py`) güncellemeleri

### Sampling mimarisi (yeni) — düşük güçlü sunucular için optimize

**Tek thread, tek loop.** Threading yok (GIL, lock, daemon yönetimi gereksiz karmaşıklık).

Ana döngü 3s tick:
- Her tick'te `/proc/stat` ve `/proc/meminfo` oku (toplam ~200 µs)
- **CPU%** önceki tick'in /proc/stat değerine karşı delta ile hesapla (0.3s sleep yok!). Bu hem daha doğru (3s pencere) hem sıfır wait
- Ring buffer'a (deque, maxlen=5) ekle
- Her **5. tick'te** (yani 15s'de bir) aggregate (max/avg) hesapla → POST et → buffer temizleme yok, deque kendi rotate eder

**Beklenen CPU yükü:** 3s'de 1 kez ~300 µs aktif çalışma + interpreter wake = **<0.05% CPU** bir Pi Zero W üzerinde bile. Geri kalan zaman `time.sleep()` ile uyuyor (idle process, planlayıcı yükü yok).

### Düşük güç optimizasyonları (özet)

- `os.statvfs` ve `/proc/mounts` her 15s'de bir okunur (her 3s'de değil — disk durumu hızlı değişmez)
- `load1/5/15`, `uptime`, `net_in/out`: sadece 15s'lik rapor anında okunur
- `ip`, `os`, `ram_total_mb`, `hostname`: process başında **bir kez** okunur, sonra cache
- HTTP POST `socket` timeout = 5s; bağlanamazsa sessiz geç, retry yok (PRD davranışı)
- `urllib.request` (stdlib) kullanılır, `requests` yok → ek paket yok
- Python yorumlayıcı RSS ~10-12 MB; idle CPU ~0% (sleep)

### Konfigürasyon (env)

- `INTERVAL` — rapor sıklığı (default 15s)
- `SAMPLE_INTERVAL` — internal örnekleme sıklığı (default 3s). Eşit veya `INTERVAL` üstünde set edilirse oversampling kapanır (yani sadece anlık değerler, max=avg=cur). Çok zayıf sunucularda kullanıcı 15s'ye çekebilir.

### Payload alanları

```json
{
  "host": "...", "ip": "...", "os": "...", "ts": 1715800000000,
  "cpu": 31.2, "cpu_max": 87.4, "cpu_avg": 38.1,
  "ram": 42.5, "ram_max": 51.0, "ram_avg": 44.3,
  "ram_total_mb": 8192,
  "disk_root": 42.1,
  "disks": [{"mount":"/","pct":42.1,"used_gb":18.2,"total_gb":50}, ...],
  "net_in": 12.3, "net_out": 4.5,
  "load1": 0.8, "load5": 0.6, "load15": 0.4,
  "uptime": 123456
}
```

### Diğer notlar
- `ip` — outbound socket trick: `s.connect(("1.1.1.1", 80)); s.getsockname()[0]` (UDP, paket gitmez)
- `os` — `/etc/os-release` parse, `PRETTY_NAME` al
- `disks` — `/proc/mounts` oku, tmpfs/devtmpfs/squashfs/overlay filtrele, her biri için `os.statvfs(mount)` ile `pct/used_gb/total_gb`
- `disk_root` — `disks` içinden `/` mount'unun pct'i
- `ip`, `os`, `ram_total_mb` ilk başlangıçta bir kez okunup cache'lenir.
- 3s'lik sampling agent CPU yükü ihmal edilebilir (her örnek <5ms, low-power VPS'lerde bile sorun değil).

---

## 4. KV TTL ayarı

Cron 60s'de bir, agent 15s'de bir. Race önlemek için:
- KV `snap:*` TTL = **120s** (PRD'deki 60s yerine)
- Cron'daki down kontrolü, kaydı varsa da `ts < now - 90s` ise stale sayar

---

## 5. Dashboard etkileri

### `types.ts`
- `MetricSnapshot`: `ip`, `os`, `disks: DiskMount[]` ekle
- `DiskMount`: `{mount: string, pct: number, used_gb: number, total_gb: number}`

### Auth UX
- Access koruması Cloudflare tarafında; dashboard kodunda token yönetimi yok
- 401 dönerse Access login sayfasına yönlendirme zaten Access yapar
- Settings sayfasında "API key yönetimi" UI'sı yok — sadece notification ayarları

### ServerDetail
- Disk grafiği: birden fazla mount varsa hepsini ayrı çizgi olarak göster
- Özet kartlara IP ve OS eklenir

### ServerCard
- Hostname altında küçük: `192.168.1.10 · Ubuntu 22.04`

---

## 6. README güncellemeleri

Yeni bölüm: **Cloudflare Access kurulumu**
1. Cloudflare → Zero Trust → Access → Applications
2. Dashboard domain'i için Self-hosted app oluştur
3. Worker'da `/api/*` (ama `/api/ingest` hariç!) için ayrı bypass policy
4. Policy: email-based veya identity provider
5. Public bypass: `/api/ingest` path'i Access'ten muaf

---

## 7. Build sırası

1. `worker/migrations/*.sql` (0001, 0002, 0003)
2. `worker/wrangler.toml` + `package.json` + `tsconfig.json`
3. `worker/src/index.ts` — endpoint'ler, cron, notification helpers
4. `agent/agent.py` (ip/os/disks dahil)
5. `agent/install.sh` + `vigil-agent.service`
6. `dashboard/` scaffold (vite, tailwind, types, api)
7. `dashboard/src/components/*` — ServerCard → ServerGrid → ServerDetail → SparkChart → AlertBanner → NotificationSettings
8. `dashboard/src/App.tsx`
9. `README.md`

---

## 8. Açık riskler / notlar

- **Access bypass /api/ingest** — Cloudflare Access policy düzgün kurulmazsa ya agent'lar 401 alır ya da admin endpoint'leri açıkta kalır. README'de bu adımı çok net yaz.
- **D1 write hacmi** — 50 server × 4/dakika = 12k satır/saat. 24h retention ile ~288k satır. 10% chance cleanup yeterli mi? Cron'da deterministik daily cleanup eklemek daha temiz olabilir (her gün 00:00 UTC'de eski kayıtlar).
- **`net_in`/`net_out` birimi** — Spec "KB/s" diyor ama agent'ta delta hesaplaması interval'a bölünmeli. Net olarak: `(bytes_now - bytes_prev) / interval_s / 1024`. Agent state tutmalı (önceki bytes).
- **Multi-NIC** — `/proc/net/dev` tüm interface'leri verir. `lo` hariç tüm interface'lerin toplamı mı yoksa default route NIC mi? Toplam (lo hariç) önerilir, basit.
- **Telegram HTML parse_mode** — mesaj formatında `<` `>` kaçırma gerekli. Hostname'de `<` olmaz ama yine de escape helper ekle.
