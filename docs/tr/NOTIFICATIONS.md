# Bildirimler — Telegram & Google Chat

Bildirimler dashboard → **Ayarlar** sayfasından yapılandırılır.
Worker'ın **cron job'u** dakikada bir koşar; eşik aşan veya down olan host'lar için
ilgili kanallara mesaj atar ve `notification_log` tablosuna kaydeder.

## Cooldown mantığı

Aynı `(host, reason)` çifti için **`cooldown_minutes` (default 15)** içinde tek bildirim
gönderilir. Birden çok kanal etkinse (Telegram + Google Chat) her ikisi de
aynı cooldown'a tâbidir — sebep başına ortak sayar.

Örnek:
- 10:00 — `prod-db-01` için CPU %91 → Telegram + Google Chat'e gönderilir.
- 10:05 — yine yüksek → **gönderilmez** (cooldown aktif).
- 10:16 — yine yüksek → gönderilir (cooldown geçti).
- 10:05 — `prod-db-01` için **RAM** yüksek (farklı reason) → gönderilir.

## Eşikler

`Ayarlar → Eşik değerleri`. CPU/RAM eşiği `*_max` (rapor penceresindeki **peak**)
değerine bakar — bu nedenle 15 saniyelik bir spike bile yakalanır.

| Default | Anlamı |
|---|---|
| CPU > 85% | high_cpu |
| RAM > 85% | high_ram |
| Disk `/` > 90% | high_disk |
| KV snap eksik **veya** ts > now - 90s | down |

`alert_on_down=false` ile down alert'leri kapatabilirsiniz (örn. spot instance'lar için).

---

## Telegram kurulumu

1. **Bot oluştur**:
   - Telegram'da `@BotFather` ile sohbet aç → `/newbot` → ad ve username ver → **token** al.
   - Token formatı: `123456789:AABBccdd...`

2. **Hedef chat'i seç**:
   - **DM**: kendi kullanıcı ID'iniz. `@userinfobot`'a `/start` deyin → ID'i alın.
   - **Grup**: gruba botu ekleyin (`Add member` → bot username). Sonra
     `/start@your_bot_name` ile aktive edin.
   - Chat ID'yi öğrenmek için:
     ```
     https://api.telegram.org/bot<TOKEN>/getUpdates
     ```
     bir mesaj atın ve `chat.id` alanını okuyun. Gruplar negatif sayıdır
     (örn. `-1001234567890`).

3. **Dashboard → Ayarlar → Telegram**:
   - Bot Token: yapıştır
   - Chat ID: yapıştır
   - Toggle: **aktif**
   - **Test Gönder** ile dene.
   - **Kaydet**.

Mesaj formatı (HTML parse_mode):

```
⚠️ [HIGH CPU] prod-db-01
CPU: 91.4% (eşik: 85%)
RAM: 67% | Disk: 45%
Load: 2.4 / 2.1 / 1.8
```

---

## Google Chat kurulumu

1. Google Chat → bildirim almak istediğiniz **Space**'e gir.
2. Space adı → **Apps & integrations** → **Webhooks** → **Add webhook**.
3. Ad ve avatar gir → **Save** → üretilen URL'i kopyala
   (`https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=...`).

4. **Dashboard → Ayarlar → Google Chat**:
   - Webhook URL: yapıştır
   - Toggle: **aktif**
   - **Test Gönder** ile dene.
   - **Kaydet**.

Google Chat HTML parse_mode'u desteklemediği için worker mesajı plain text + `*` markup
olarak gönderir.

---

## Maskelenmiş alanlar

Settings sayfasını her açtığınızda secret alanlar `••••<son4>` olarak görüntülenir.

- **Maskelenmiş değeri olduğu gibi bırakırsanız** → backend mevcut değeri korur.
- **Yeni değer yazarsanız** → backend onu kaydeder.
- Token'ı **silmek** istiyorsanız: alanı tamamen temizleyin (boş bırakın) ve kaydedin.

## Bildirim logu

Dashboard alttaki "Son bildirimler" tablosu D1 `notification_log` tablosundan
son 50 kaydı gösterir. Worker'ın cron job'ı her saat başı 30 günden eski kayıtları temizler.

## Mesaj formatını değiştirmek

`worker/src/index.ts` içinde `formatAlertHtml` / `formatAlertPlain`.
Değişiklik sonrası `wrangler deploy` yapın.

## Hata ayıklama

| Belirti | Çözüm |
|---|---|
| Test gönder başarısız, "telegram 401" | Token yanlış |
| Test gönder başarısız, "telegram 400 chat not found" | Chat ID yanlış veya bot grubu terk etmiş |
| Test başarılı ama alert gelmiyor | Cooldown aktif olabilir; `notification_log`'a bak veya `cooldown_minutes`'ı 1'e indirip dene |
| Aynı alert 2 kez geliyor | İki ayrı kanal etkin (Telegram + GChat) — beklendiği gibi |
| Google Chat 403 | Webhook URL revoke edilmiş veya yanlış yapıştırılmış |
| Türkçe karakterler bozuk | Telegram HTML parse_mode kullanıyor — `<`/`>` agent host adında varsa escape edilir; başka karakter sorunu yok |
