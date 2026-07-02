# Kimlik Doğrulama — Admin Token

Vigil iki ayrı sırla çalışır:

| Secret | Kim kullanır | Nereye gider |
|---|---|---|
| **API_KEY** | Agent'lar (her sunucu) | `X-API-Key` header → sadece `POST /api/ingest` |
| **ADMIN_TOKEN** | Dashboard kullanıcısı / admin | `X-Admin-Token` header → diğer tüm `/api/*` endpoint'leri |

Cloudflare Access **kullanılmaz** — kurulum basit kalsın diye Worker tarafında iki secret ile yetkilendirme yapılır.

## ADMIN_TOKEN oluşturma

Uzun, rastgele bir değer üret:

```bash
openssl rand -hex 32
# örn: 7a2c4f8e9b... (64 karakter)
```

Worker'a secret olarak yaz:

```bash
cd worker
wrangler secret put ADMIN_TOKEN
# istendiğinde değeri yapıştır
```

## Dashboard'da kullanma

1. Dashboard'u aç → ilk açılışta login modali çıkar.
2. ADMIN_TOKEN değerini yapıştır → **Giriş**.
3. Token tarayıcının `localStorage`'ında (`vigil_admin_token` anahtarı) tutulur — her API çağrısında `X-Admin-Token` header'ı olarak gönderilir.
4. Sağ üstteki **Çıkış** butonu localStorage'ı temizler ve login modalini tekrar açar.

## API_KEY oluşturma

Aynı şekilde uzun rastgele bir değer. Agent kurulumunda `--key` flag'ı olarak verilir.

```bash
openssl rand -hex 32
wrangler secret put API_KEY
```

Bu değeri **agent host'larında** `/etc/vigil-agent.env` içinde de saklamanız gerekecek.

## Rotasyon

### ADMIN_TOKEN

Tek kullanıcı varsa basit:
1. Yeni token üret, `wrangler secret put ADMIN_TOKEN`.
2. Dashboard sağ üst **Çıkış** → modal'da yeni token'ı gir.

Çoklu kullanıcı: yeni token'ı tüm kullanıcılara dağıtın ve eş zamanlı geçin (eski token reddedildiği anda eski browser tab'leri 401 alır, modal otomatik açılır).

### API_KEY

Detaylar: [OPERATIONS.md → API_KEY rotasyonu](OPERATIONS.md#api_key-rotasyonu).

## Güvenlik notları

- **localStorage** XSS karşısında savunmasızdır. Dashboard tek bir `<script>` ile (kendi build'iniz) çalıştığı ve dışarıdan kod yüklemediği için bu risk düşüktür. Hassas ortamlarda dashboard'u yine de bir VPN veya Cloudflare Access arkasına almayı düşünebilirsiniz.
- **HTTPS zorunlu** — Cloudflare Workers/Pages zaten HTTPS dayatır. Token cleartext gitmez.
- **Token sızarsa** rotasyon hızlıdır (yukarı).
- **Brute force**: Worker timing-safe karşılaştırma yapmıyor. ADMIN_TOKEN 32+ karakter rastgele ise pratik risk yok. Daha sıkı senaryoda Worker'a basit rate limit eklenebilir (bkz. [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)).
- **CORS** `*` ile açık ama token header üzerinden gönderildiği için kötü niyetli bir site otomatik kullanamaz (kullanıcının token'ı zaten yok). Cookie kullanılmıyor.

## İleride Cloudflare Access istenirse

Bu basit modeli kaldırmadan, Pages domain'i için CF Access uygulayabilirsiniz — defense-in-depth olarak çalışırlar:

1. Cloudflare → Zero Trust → Access → Application → Self-hosted → dashboard URL.
2. Policy ekleyin (email/group).
3. Worker'da `ADMIN_TOKEN` middleware'i değişmez; ek bir kapı olur.

Bu durumda `/api/ingest` endpoint'ini Access'ten **bypass** etmeyi unutmayın (agent'lar tarayıcı değildir).
