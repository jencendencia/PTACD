// Cross-machine job serialization for PTA CD (multi-user hardening).
//
// When several PTA machines share one MySQL database, rebuild jobs (family
// sync + charge recompute) and the schema migration must run on exactly ONE
// machine at a time — otherwise two machines can both INSERT the same family
// rows, both ALTER the same table, or race each other's dedup. MySQL's
// GET_LOCK() is the distributed lock: no new infrastructure, scoped to the
// session (a machine that dies mid-job releases the lock automatically), and
// it lives on the same server the app already talks to.
//
// The lock is acquired on a dedicated pooled connection and held for the
// duration of `fn`. Acquisitions are chained per machine so at most one job
// holds a lock connection at a time — several jobs firing at once (boot +
// reconnect + a manual sync) can't exhaust the pool waiting for inner query
// connections.
import { db } from '../db/connection';

let jobChain: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` only while this machine holds the MySQL named lock `name`.
 *
 * `timeout` is how many seconds GET_LOCK waits for a busy lock before giving
 * up — 0 means "skip immediately if another machine is working" (right for
 * boot-time rebuilds, which re-run later), a larger value means "wait for the
 * current holder to finish" (right for an admin-initiated sync and the schema
 * migration, which must complete).
 *
 * Returns the job's result, or null when the lock was not acquired (another
 * machine holds it, or the DB is offline).
 */
export function withJobLock<T>(name: string, fn: () => Promise<T>, timeout = 0): Promise<T | null> {
  if (!db.isOnline()) return Promise.resolve(null);
  const run = jobChain.then(() => acquireAndRun(name, fn, timeout));
  jobChain = run.catch(() => undefined);
  return run;
}

async function acquireAndRun<T>(name: string, fn: () => Promise<T>, timeout: number): Promise<T | null> {
  return db.withConnection(async (conn) => {
    const rows = (await conn.query('SELECT GET_LOCK(?, ?) AS got', [name, timeout]))[0] as unknown as {
      got: number;
    }[];
    const got = rows[0]?.got;
    if (got !== 1) return null;
    try {
      return await fn();
    } finally {
      // Release even if the job threw; if the process died mid-job MySQL
      // releases the lock for us when the session ends.
      await conn.query('SELECT RELEASE_LOCK(?) AS rel', [name]).catch(() => undefined);
    }
  });
}
