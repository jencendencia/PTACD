# License Server Deployment — PTA CD

One-time setup for the Cloudflare Worker that validates PTA CD license keys
and tracks per-machine activations (see `APP_UPDATE_AND_ACTIVATION_PROCESS.md §2`).

## 1. Prerequisites

- A Cloudflare account with Workers + KV enabled
- `npx wrangler login` (authenticate Wrangler once)

## 2. Create the KV namespace

```bash
npx wrangler kv:namespace create LICENSE_KV
```

Copy the returned **id** and paste it into `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "LICENSE_KV"
id = "<paste-id-here>"
```

## 3. Set the admin secret

Open `src/index.js` and change the top constant (this gates every `/admin/*` endpoint):

```js
const ADMIN_SECRET = 'CHANGE_ME_admin_secret';
```

> Use a long random string. Never commit the real secret — the file already ships
> with a placeholder, so keep the real one in your head / a password manager.

## 4. Deploy

```bash
npx wrangler deploy
```

The worker URL is printed (e.g. `https://pta-license-server.<you>.workers.dev`).
Point the desktop app at it if it is not the default:

```bash
# .env at the project root (same file as DB_* settings)
PTA_LICENSE_SERVER=https://pta-license-server.<you>.workers.dev
```

## 5. Seed initial keys (one per customer)

```bash
node seed.js YOUR_ADMIN_SECRET https://pta-license-server.<you>.workers.dev
```

This creates 3 keys (`DTR-XXXX-XXXX-XXXX`) with `maxActivations: 1` each.
Pass a count as the 3rd argument to create more.

## 6. Managing keys (admin)

```bash
# Add a key (per customer, max 1 machine by default)
curl -X POST https://pta-license-server.<you>.workers.dev/admin/add-key \
  -H "Content-Type: application/json" \
  -d '{"adminSecret":"YOUR_SECRET","maxActivations":1}'

# Revoke a key
curl -X POST https://pta-license-server.<you>.workers.dev/admin/revoke \
  -H "Content-Type: application/json" \
  -d '{"adminSecret":"YOUR_SECRET","key":"DTR-XXXX-XXXX-XXXX"}'

# List all keys
curl -H "X-Admin-Secret: YOUR_SECRET" \
  https://pta-license-server.<you>.workers.dev/admin/list-keys
```

## Notes

- **Re-activation:** the same machine can re-activate freely (the server keeps an
  `activations` array and recognizes already-registered machine IDs).
- **Max activations:** a key works on up to `maxActivations` distinct machines.
- **Expiry:** pass an ISO `expiresAt` to `/admin/add-key` to make a key expire.
- **Local cache:** the app stores the result in `userData/license.json` and skips
  the server on later launches until the file is removed.
