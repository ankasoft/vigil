# Dashboard Setup

Built as a React SPA with Vite, hosted on Cloudflare Pages.

## 1. Dependencies

```bash
cd dashboard
npm install
```

## 2. Local testing

Create `.env`:
```bash
cp .env.example .env
# VITE_API_URL=https://vigil.<your-account>.workers.dev
```

Development server:
```bash
npm run dev
```
http://localhost:5173 — on first launch you are prompted for the **admin token** (the value you assigned to the worker with `wrangler secret put ADMIN_TOKEN`). The token is saved to the browser's `localStorage`.

## 3. Deploy to Cloudflare Pages

### Method A — Git integration (recommended)

1. Cloudflare → Workers & Pages → **Create application** → **Pages** → **Connect to Git**.
2. Select the repo.
3. Build settings:

   | Field | Value |
   |---|---|
   | Production branch | `main` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | `dashboard` |

4. **Environment variables**:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | Worker base URL (e.g. `https://vigil.<your>.workers.dev`) |

5. **Save and Deploy**.

### Method B — Wrangler CLI

```bash
cd dashboard
npm run build
npx wrangler pages deploy dist --project-name vigil-dashboard
```

The same command is sufficient for subsequent deploys.

## 4. First login

1. Open the Pages URL (e.g. `vigil-dashboard.pages.dev`) → the login modal appears.
2. Paste the `ADMIN_TOKEN` value → **Login**.
3. The token is stored in `localStorage`; it won't be asked again.
4. **Logout** in the top right clears localStorage and reopens the modal.

Auth details: [AUTH.md](AUTH.md).

## Customizing server display names

You can give a host a browser-specific **alias**:

1. Click a card → the detail modal opens.
2. Click the pencil icon (✎) in the title.
3. Type the new name → Enter (or click ✓), Esc to cancel (or ✗).
4. This name appears both on the card and in the modal; the real hostname continues to show in small print.

Storage: entirely `localStorage` (the `vigil_host_aliases` key). Valid only in that browser; when you log in from another device/browser, the default hostname is shown. To clear it: empty the input and save.

## 5. Custom domain (optional)

Cloudflare Pages → Project → **Custom domains** → Add. DNS is managed automatically.

## 6. Clearing the build cache

If colors/styles don't load despite being changed:
- Pages dashboard → Latest deployment → **Retry deployment**.
- Or clear the browser cache.

---

## Development

File structure:
```
dashboard/src/
├── App.tsx              # top layout, header, view switch
├── main.tsx             # React entry
├── auth.tsx             # AuthProvider, login modal, 401 handling
├── api.ts               # typed fetch client (X-Admin-Token header)
├── types.ts             # shared types
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

If you change these, also update the table in `docs/OPERATIONS.md`.

## Debugging

| Symptom | Solution |
|---|---|
| Login modal never closes | Token is wrong or `ADMIN_TOKEN` is not set on the worker — check with `wrangler secret list` |
| Suddenly asks to log in again while running | `ADMIN_TOKEN` changed on the worker or the secret was deleted; or the CORS request was rejected |
| Blank page, `Failed to fetch` in the console | `VITE_API_URL` is not set or is wrong |
| CORS error | The worker returns `Access-Control-Allow-Origin: *`; if needed, pin the origin in `worker/src/index.ts` |
| Dark mode always on/off | OS theme setting; if you want to add a manual override, modify the `useEffect` in App.tsx |
