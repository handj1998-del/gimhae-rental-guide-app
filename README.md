# LOTTE rent-a-car Gimhae Airport – Rental Guide (installable web app)

8-language guide (en, ja, zh-CN, zh-TW, vi, th, ru, ko) as an installable PWA with an admin settings page.
Node.js >= 18, one dependency (`qrcode`).

## Run locally
    npm ci          # or: npm install
    npm start       # http://localhost:8080   (admin: http://localhost:8080/admin)

On first start without `ADMIN_PASSWORD`, a random admin password is generated and written to
`ADMIN_PASSWORD.txt` (chmod 600). Only a scrypt hash is kept in `data/admin.json`.

## URLs
| URL | Purpose |
|---|---|
| `/` | Guide (language switcher, Install app, PDF download) |
| `/?src=qr` | QR-code entry. QR blocking is **OFF by default**; when an admin turns it on, QR visitors get the guide only (no install / PDF) for the rest of the browser session |
| `/admin` | Admin login + settings (QR blocking, languages, PDF, install, office phones/hours, QR PNG) |
| `/healthz` | Health check |

## Environment variables
| Var | Meaning |
|---|---|
| `PORT` | Port (default 8080; most hosts set it automatically) |
| `ADMIN_PASSWORD` | **Set this when hosting.** Admin password (hashed at startup; overrides ADMIN_PASSWORD.txt) |
| `SESSION_SECRET` | Long random string used to sign the QR cookie (otherwise generated into `DATA_DIR/secret.key`) |
| `DATA_DIR` | Where settings are stored (default `./data`). Point it at a persistent disk/volume when hosting |
| `TRUST_PROXY=1` | Behind a reverse proxy/load balancer (Render, Railway, Fly.io, nginx) |
| `PUBLIC_URL` | Optional default for the admin "Public site URL" (QR target), e.g. https://your-app.onrender.com |
| `COOKIE_SECURE=1` | Always send cookies with `Secure` (use with HTTPS) |

Generate a password/secret: `node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"`

## Deploy
Any Node host or Docker host works (`Dockerfile` included). Recommended env on a host:
`ADMIN_PASSWORD=…  SESSION_SECRET=…  TRUST_PROXY=1  COOKIE_SECURE=1  DATA_DIR=/data` + a persistent volume at `/data`.

- **Render**: New Web Service → upload repo → Build `npm ci`, Start `npm start` → add env vars → add a Disk mounted at `/data` (paid instance; free instances lose settings on restart).
- **Railway**: New project from repo → env vars → add a Volume mounted at `/data`.
- **Fly.io**: `fly launch` (uses Dockerfile) → `fly volumes create data --size 1` → mount at `/data` in fly.toml → `fly secrets set ADMIN_PASSWORD=… SESSION_SECRET=…`.
- **VPS** (Lightsail, Vultr, etc.): install Node 20, `npm ci`, run with systemd or pm2, put Caddy/nginx in front for HTTPS (`TRUST_PROXY=1`).

After deploying, open `/admin`, set **Public site URL** to your https address, save, and download the QR PNG.

## Tests
- `tools/curl-test.sh [base-url]` – HTTP tests (normal / QR / admin / settings effect / rate limit).
  Note: it triggers the login rate limit for your IP at the end (15 min lock; restart the server to clear).

## Limits (by design, cannot be fully prevented)
- The QR flag is an HttpOnly, signed session cookie. Clearing cookies, closing the browser, or using
  a private window/another browser and opening `/` directly (without `?src=qr`) makes the visitor a normal visitor.
- Screenshots, printing and copy-paste of the visible guide cannot be blocked.
- Some browsers (iOS Safari "Add to Home Screen", Samsung Internet) can still add a plain bookmark icon
  without a manifest; for QR sessions it is not an offline app and PDFs still return 403.
- Admin sessions and login rate limits are in memory (reset on restart; single-instance only).
