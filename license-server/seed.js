// Seeds initial license keys for PTA CD (one per customer, doc §2.5).
// Usage:
//   node seed.js <ADMIN_SECRET> <SERVER_URL> [count]
// Examples:
//   node seed.js my-secret https://pta-license-server.your-name.workers.dev
//   node seed.js my-secret https://pta-license-server.your-name.workers.dev 5
const [, , adminSecret, serverUrl, countArg] = process.argv;
const count = Math.max(1, Number(countArg) || 3);

if (!adminSecret || !serverUrl) {
  console.error('Usage: node seed.js <ADMIN_SECRET> <SERVER_URL> [count]');
  process.exit(1);
}

async function main() {
  console.log(`Seeding ${count} license key(s) on ${serverUrl} …`);
  for (let i = 0; i < count; i++) {
    const res = await fetch(`${serverUrl}/admin/add-key`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminSecret, maxActivations: 1 }),
    });
    const data = await res.json();
    if (!res.ok || !data.key) {
      console.error(`  ✗ request ${i + 1} failed: ${data.error || res.statusText}`);
      process.exit(1);
    }
    console.log(`  ✓ ${data.key}  (max ${data.maxActivations} activation(s))`);
  }
  console.log('\nDone. Hand each key to one customer (1 machine per key).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
