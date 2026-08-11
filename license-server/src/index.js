// PTA CD license server — Cloudflare Worker.
// Validates license keys and tracks per-machine activations in a KV namespace.
// See APP_UPDATE_AND_ACTIVATION_PROCESS.md §2 and DEPLOY.md in this folder.
//
// Endpoints:
//   POST /validate           { key, machineId }        → { valid } (registers the machine)
//   POST /admin/add-key      { adminSecret, maxActivations?, expiresAt? } → { key }
//   GET  /admin/list-keys    header X-Admin-Secret      → { keys: [...] }
//   POST /admin/revoke       { adminSecret, key }       → { ok }
//
// ⚠ Change this before deploying — it is the only gate on admin endpoints.
const ADMIN_SECRET = 'CHANGE_ME_admin_secret';

// Unambiguous characters (no 0/O/1/I) — key format DTR-XXXX-XXXX-XXXX (doc §2.6).
const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_PREFIX = 'DTR';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

// Crypto-secure random (Web Crypto is available in Workers).
function randomAlphabetChar() {
  const buf = new Uint8Array(1);
  // Rejection sampling so every alphabet index is equally likely.
  let n = 0;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= Math.floor(256 / KEY_ALPHABET.length) * KEY_ALPHABET.length);
  return KEY_ALPHABET[n % KEY_ALPHABET.length];
}

function generateKey() {
  const group = () => {
    let out = '';
    for (let i = 0; i < 4; i++) out += randomAlphabetChar();
    return out;
  };
  return `${KEY_PREFIX}-${group()}-${group()}-${group()}`;
}

async function handleValidate(request, env) {
  const body = await request.json().catch(() => null);
  const key = String(body?.key ?? '').trim().toUpperCase();
  const machineId = String(body?.machineId ?? '').trim();
  if (!key) return json({ valid: false, error: 'License key is required.' });
  if (!machineId) return json({ valid: false, error: 'Machine ID is required.' });

  const record = await env.LICENSE_KV.get(`key:${key}`, 'json');
  if (!record) return json({ valid: false, error: 'Invalid license key.' });
  if (record.revoked) return json({ valid: false, error: 'This license key has been revoked.' });
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    return json({ valid: false, error: 'This license key has expired.' });
  }
  // Same machine re-activating: recognized, no extra slot consumed (doc §2.4).
  if (record.activations.includes(machineId)) {
    return json({ valid: true, key, machineId });
  }
  if (record.activations.length >= record.maxActivations) {
    return json({
      valid: false,
      error: 'This license key has already been activated on the maximum number of machines.',
    });
  }
  record.activations.push(machineId);
  await env.LICENSE_KV.put(`key:${key}`, JSON.stringify(record));
  return json({ valid: true, key, machineId });
}

async function handleAddKey(request, env) {
  const body = await request.json().catch(() => null);
  if (body?.adminSecret !== ADMIN_SECRET) return json({ error: 'Unauthorized.' }, 401);
  const maxActivations = Math.max(1, Number(body?.maxActivations) || 1);
  const expiresAt = body?.expiresAt || null;
  const key = generateKey();
  const record = {
    key,
    maxActivations,
    activations: [],
    revoked: false,
    expiresAt,
    createdAt: new Date().toISOString(),
  };
  await env.LICENSE_KV.put(`key:${key}`, JSON.stringify(record));
  const list = (await env.LICENSE_KV.get('keys', 'json')) || [];
  list.push(key);
  await env.LICENSE_KV.put('keys', JSON.stringify(list));
  return json({ ok: true, key, maxActivations, expiresAt });
}

async function handleListKeys(request, env) {
  if (request.headers.get('X-Admin-Secret') !== ADMIN_SECRET) return json({ error: 'Unauthorized.' }, 401);
  const list = (await env.LICENSE_KV.get('keys', 'json')) || [];
  const keys = [];
  for (const key of list) {
    const rec = await env.LICENSE_KV.get(`key:${key}`, 'json');
    if (rec) keys.push(rec);
  }
  return json({ ok: true, keys });
}

async function handleRevoke(request, env) {
  const body = await request.json().catch(() => null);
  if (body?.adminSecret !== ADMIN_SECRET) return json({ error: 'Unauthorized.' }, 401);
  const key = String(body?.key ?? '').trim().toUpperCase();
  const rec = await env.LICENSE_KV.get(`key:${key}`, 'json');
  if (!rec) return json({ ok: false, error: 'License key not found.' });
  rec.revoked = true;
  await env.LICENSE_KV.put(`key:${key}`, JSON.stringify(rec));
  return json({ ok: true, key });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const method = request.method;
    if (pathname === '/validate' && method === 'POST') return handleValidate(request, env);
    if (pathname === '/admin/add-key' && method === 'POST') return handleAddKey(request, env);
    if (pathname === '/admin/list-keys' && method === 'GET') return handleListKeys(request, env);
    if (pathname === '/admin/revoke' && method === 'POST') return handleRevoke(request, env);
    if (pathname === '/health') return json({ ok: true });
    return json({ error: 'Not found.' }, 404);
  },
};
