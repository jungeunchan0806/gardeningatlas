# gardeningatlas Deployment Notes

## Current Local URL

Run:

```powershell
npm start
```

Then open:

```text
http://127.0.0.1:8765/
http://127.0.0.1:8765/pc
http://127.0.0.1:8765/mobile
```

For same Wi-Fi devices, use the PC's private IP:

```text
http://172.30.1.75:8765/pc
http://172.30.1.75:8765/mobile
```

## Current Temporary Public URLs

```text
PC UI: https://raw-geographic-operational-planet.trycloudflare.com/pc?v=23
Mobile UI: https://raw-geographic-operational-planet.trycloudflare.com/mobile?v=23
Privacy policy: https://raw-geographic-operational-planet.trycloudflare.com/privacy.html
Terms: https://raw-geographic-operational-planet.trycloudflare.com/terms.html
Manifest: https://raw-geographic-operational-planet.trycloudflare.com/manifest.webmanifest
```

## Public Internet Deployment

The app is ready for a fixed-domain Node.js host. It includes:

- `render.yaml` for Render Blueprint deployment with a persistent `/var/data` disk.
- `Dockerfile` for VPS, Railway, Fly.io, or any Docker host.
- `DATA_DIR` support so uploaded plant photos and users can persist outside the app folder.

Set:

```text
PUBLIC_BASE_URL=https://your-domain.example
HOST=0.0.0.0
DATA_DIR=/var/data
```

Do not hard-code `PORT` on hosts that provide their own port environment variable. Use HTTPS before connecting real payments.

Good starter hosts:

- Render
- Railway
- Fly.io
- Oracle Cloud or another VPS

Render path:

1. Create or connect a Git repository containing this folder.
2. In Render, create a Blueprint from `render.yaml`.
3. Set `PUBLIC_BASE_URL` to the final HTTPS domain.
4. Add a custom domain in Render and point DNS to the value Render provides.
5. After DNS is verified, open `/pc`, `/mobile`, `/privacy.html`, `/terms.html`, and `/manifest.webmanifest`.

## Payments

The app now has payment order and confirmation APIs:

- `POST /api/payment/create`
- `POST /api/payment/confirm`

Without Toss keys, it uses a mock development payment so the flow can be tested.
With `TOSS_CLIENT_KEY` and `TOSS_SECRET_KEY`, the frontend can open Toss Payments and the server can confirm payment with Toss.

Official docs used:

- https://docs.tosspayments.com/en/integration
- https://docs.tosspayments.com/en/api-guide

## Before Real Launch

- Replace SHA-256 password storage with bcrypt/argon2.
- Move JSON files to a real DB such as PostgreSQL.
- Add email sending for password reset codes.
- Add privacy policy and terms pages.
- Add HTTPS and secure cookies/session tokens.
- Add payment webhook handling for cancellations, refunds, and subscription renewal failures.
