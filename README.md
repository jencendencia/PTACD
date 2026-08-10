# PTA CD — Collection & Disbursement

PTA fund management for schools using the **TapIn School** database. Reads
students / guardians / sections / school years from the shared `tapin_school`
MySQL database and adds its own `pta_*` tables.

## Setup

1. Make sure **TapIn School**'s MySQL database (`tapin_school`) is reachable.
2. `npm install`
3. Create a `.env` next to `package.json` (a documented template is in
   `.env.example`; defaults shown):
   ```
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=
   DB_NAME=tapin_school
   ```
   The app loads `.env` itself on startup (`electron/db/env.ts`) — no extra
   tooling needed. Real OS environment variables (`DB_HOST`, etc.) take
   precedence over `.env`.
4. `npm run dev` — starts Vite (port 5174) + Electron.
   Or `npm run dev:renderer` for browser-only mock mode (no Electron/MySQL).

## Installing on another computer (network database)

The PTA app does not need MySQL installed locally — it connects to the
shared `tapin_school` database over the network.

**On the computer that runs MySQL (one-time setup):**

1. Make sure MySQL listens on the network:
   `bind-address = *` in `my.ini` (default on MySQL 8 Windows installs) and
   the Windows Firewall allows inbound TCP 3306.
2. Create a MySQL user that can log in from other computers:
   ```sql
   CREATE USER 'pta'@'%' IDENTIFIED BY 'a-strong-password';
   GRANT ALL PRIVILEGES ON tapin_school.* TO 'pta'@'%';
   FLUSH PRIVILEGES;
   ```
   (Do not expose `root`; `root@localhost` stays local-only.)
3. Note the server's LAN IP (`ipconfig` → IPv4 Address, e.g. `192.168.1.129`).

**On each computer that runs the PTA app:**

1. Copy this project, run `npm install`.
2. Create `.env` pointing at the database server:
   ```
   DB_HOST=192.168.1.129
   DB_PORT=3306
   DB_USER=pta
   DB_PASSWORD=a-strong-password
   DB_NAME=tapin_school
   ```
3. `npm run dev` — the app bootstraps its own `pta_*` tables on first connect
   (the `pta` user needs `CREATE` — the grant above includes it).

All computers share the same data; no local MySQL needed. The first boot
seeds the default **admin / admin** officer account.

The app self-creates all `pta_*` tables on boot (idempotent). The first boot
seeds a default **admin / admin** officer account (change it after first login).

## Billing example (default fee components)

```
650 per child = 200 Membership (per family) + 200 Misc (per child) + 250 Other (per child)
3 children in one family → 650 + 450 + 450 = 1,550 (membership charged once)
```

Amounts, terms and distribution percentages are configurable in **Settings**
and **Funds & Distribution**.

## Docs

See **PLAN.md** for the full design (data model, workflows, reports, roadmap).
