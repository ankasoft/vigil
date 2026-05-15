# Dashboard Kurulumu

React SPA olarak Vite ile build edilir, Cloudflare Pages üzerinde host edilir.

## 1. Bağımlılıklar

```bash
cd dashboard
npm install
```

## 2. Yerel test

`.env` oluştur:
```bash
cp .env.example .env
# VITE_API_URL=https://vigil.<your-account>.workers.dev
```

Geliştirme sunucusu:
```bash
npm run dev
```
http://localhost:5173 — ilk açılışta **admin token** sorulur (worker'a `wrangler secret put ADMIN_TOKEN` ile atadığınız değer). Token tarayıcının `localStorage`'ına kaydedilir.

## 3. Cloudflare Pages'a deploy

### Yöntem A — Git entegrasyonu (önerilen)

1. Cloudflare → Workers & Pages → **Create application** → **Pages** → **Connect to Git**.
2. Repo'yu seç.
3. Build ayarları:

   | Alan | Değer |
   |---|---|
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `dashboard` |

4. **Environment variables**:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | Worker base URL (örn. `https://vigil.<your>.workers.dev`) |

5. **Save and Deploy**.

### Yöntem B — Wrangler CLI

```bash
cd dashboard
npm run build
npx wrangler pages deploy dist --project-name vigil-dashboard
```

Sonraki deploylar için aynı komut yeterli.

## 4. İlk giriş

1. Pages URL'i (örn. `vigil-dashboard.pages.dev`) açılır → login modal'ı görünür.
2. `ADMIN_TOKEN` değerini yapıştırın → **Giriş**.
3. Token `localStorage`'da saklanır; bir daha sormaz.
4. Sağ üstteki **Çıkış** ile localStorage temizlenir, modal tekrar açılır.

Auth detayları: [AUTH.md](AUTH.md).

## Sunucu görünen adlarını özelleştirme

Bir host'a tarayıcına özel **alias** verebilirsin:

1. Karta tıkla → detay modalı açılır.
2. Başlıktaki kalem ikonuna (✎) tıkla.
3. Yeni adı yaz → Enter (veya tikle ✓), iptal için Esc (veya ✗).
4. Hem kartta hem modalda bu ad görünür; gerçek hostname küçük puntoda görünmeye devam eder.

Saklama: tamamen `localStorage` (`vigil_host_aliases` anahtarı). Sadece o tarayıcıda geçerli; başka cihaz/tarayıcıdan girdiğinde varsayılan hostname görünür. Temizlemek için: input'u boşalt ve kaydet.

## 5. Custom domain (opsiyonel)

Cloudflare Pages → Project → **Custom domains** → Add. DNS otomatik yönetilir.

## 6. Build cache temizliği

Renkler/style değişmesine rağmen yüklenmiyorsa:
- Pages dashboard → Latest deployment → **Retry deployment**.
- Veya tarayıcı cache temizleme.

---

## Geliştirme

Dosya yapısı:
```
dashboard/src/
├── App.tsx              # üst layout, header, view switch
├── main.tsx             # React entry
├── auth.tsx             # AuthProvider, login modal, 401 yakalama
├── api.ts               # typed fetch client (X-Admin-Token header)
├── types.ts             # paylaşılan tipler
├── utils.ts             # formatters, level colors
├── styles.css           # Tailwind + component classes
└── components/
    ├── ServerGrid.tsx
    ├── ServerCard.tsx
    ├── ServerDetail.tsx
    ├── SparkChart.tsx
    ├── AlertBanner.tsx
    ├── NotificationSettings.tsx
    └── Toast.tsx
```

Polling intervals:
- `ServerGrid` → 15 s
- `AlertBanner` → 30 s
- `ServerDetail` history → 15 s
- `NotificationSettings` log → 60 s

Bunları değiştirirsen `docs/OPERATIONS.md` içindeki tabloyu da güncelle.

## Hata ayıklama

| Belirti | Çözüm |
|---|---|
| Login modal'ı hiç kapanmıyor | Token yanlış veya worker'da `ADMIN_TOKEN` set edilmemiş — `wrangler secret list` ile kontrol et |
| Çalışırken aniden tekrar login soruyor | Worker'da `ADMIN_TOKEN` değişmiş veya secret silinmiş; ya da CORS önerisi reddedilmiş |
| Sayfa boş, console'da `Failed to fetch` | `VITE_API_URL` ayarlanmamış veya yanlış |
| CORS hatası | Worker `Access-Control-Allow-Origin: *` döner; gerekirse `worker/src/index.ts` içindeki origin'i sabitleyin |
| Dark mode hep açık/kapalı | OS tema ayarı; manuel override eklemek isterseniz App.tsx içindeki `useEffect`'i değiştirin |
