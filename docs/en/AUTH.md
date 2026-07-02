# Authentication — Admin Token

Vigil works with two separate secrets:

| Secret | Who uses it | Where it goes |
|---|---|---|
| **API_KEY** | Agents (every server) | `X-API-Key` header → only `POST /api/ingest` |
| **ADMIN_TOKEN** | Dashboard user / admin | `X-Admin-Token` header → all other `/api/*` endpoints |

Cloudflare Access is **not used** — to keep the setup simple, authorization is done on the Worker side with two secrets.

## Creating the ADMIN_TOKEN

Generate a long, random value:

```bash
openssl rand -hex 32
# e.g.: 7a2c4f8e9b... (64 characters)
```

Store it as a secret on the Worker:

```bash
cd worker
wrangler secret put ADMIN_TOKEN
# paste the value when prompted
```

## Using it in the Dashboard

1. Open the dashboard → a login modal appears on first launch.
2. Paste the ADMIN_TOKEN value → **Sign in**.
3. The token is kept in the browser's `localStorage` (key `vigil_admin_token`) — it is sent as the `X-Admin-Token` header on every API call.
4. The **Sign out** button in the top right clears localStorage and reopens the login modal.

## Creating the API_KEY

A long random value in the same way. It is provided as the `--key` flag during agent setup.

```bash
openssl rand -hex 32
wrangler secret put API_KEY
```

You will also need to store this value on the **agent hosts** inside `/etc/vigil-agent.env`.

## Rotation

### ADMIN_TOKEN

Simple if there is a single user:
1. Generate a new token, `wrangler secret put ADMIN_TOKEN`.
2. Dashboard top right **Sign out** → enter the new token in the modal.

Multiple users: distribute the new token to all users and switch over simultaneously (the moment the old token is rejected, old browser tabs get a 401 and the modal opens automatically).

### API_KEY

Details: [OPERATIONS.md → API_KEY rotation](OPERATIONS.md#api_key-rotation).

## Security notes

- **localStorage** is vulnerable to XSS. Since the dashboard runs from a single `<script>` (your own build) and does not load code from outside, this risk is low. In sensitive environments you may still want to put the dashboard behind a VPN or Cloudflare Access.
- **HTTPS is mandatory** — Cloudflare Workers/Pages already enforce HTTPS. The token never goes over cleartext.
- **If a token leaks**, rotation is fast (see above).
- **Brute force**: the Worker does not do timing-safe comparison. If the ADMIN_TOKEN is 32+ random characters there is no practical risk. In a stricter scenario, a simple rate limit can be added to the Worker (see [Cloudflare Rate Limiting Rules](https://developers.cloudflare.com/waf/rate-limiting-rules/)).
- **CORS** is open with `*`, but since the token is sent via a header a malicious site cannot use it automatically (the user does not have the token anyway). No cookies are used.

## If Cloudflare Access is wanted later

Without removing this simple model, you can apply CF Access to the Pages domain — they work as defense-in-depth:

1. Cloudflare → Zero Trust → Access → Application → Self-hosted → dashboard URL.
2. Add a policy (email/group).
3. The `ADMIN_TOKEN` middleware on the Worker does not change; it becomes an additional gate.

In that case, do not forget to **bypass** the `/api/ingest` endpoint from Access (agents are not browsers).
