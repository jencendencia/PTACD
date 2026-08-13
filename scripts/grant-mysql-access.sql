-- PTA CD — one-time network account grant (run ONCE on the MySQL server host).
--
--   mysql -u root -p < scripts/grant-mysql-access.sql
--
-- WHY '%': MySQL accounts are user@host pairs. Granting 'pta'@'%' means ANY
-- computer on the network can authenticate with this account — a freshly
-- installed PTA CD machine is automatically covered, no per-machine grant
-- needed. On a school LAN this is the practical choice.
--
-- TIGHTER OPTION (recommended if the subnet is stable): replace '%' with the
-- LAN subnet so only machines on that network can connect, e.g.
--   'pta'@'192.168.1.%'
--
-- The privileges below are exactly what the app needs: it self-creates and
-- migrates its pta_* tables at boot (CREATE/ALTER/INDEX/REFERENCES) and then
-- reads/writes data (SELECT/INSERT/UPDATE/DELETE). DROP is included for
-- cleanup scripts; remove it if you prefer stricter limits.
--
-- Prereqs on the server: MySQL listens on the network (bind-address = * in
-- my.ini/my.cnf) and inbound TCP 3306 is open in the firewall.

CREATE USER IF NOT EXISTS 'pta'@'%' IDENTIFIED BY 'joel';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON tapin_school.* TO 'pta'@'%';

FLUSH PRIVILEGES;

-- Verify from any client machine:
--   mysql -h <server-ip> -u pta -p tapin_school
