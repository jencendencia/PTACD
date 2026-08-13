// Transient-write retry (multi-user hardening for PTA CD).
//
// MySQL reports two codes for transient lock contention: 1213
// (ER_LOCK_DEADLOCK — InnoDB rolled back a transaction) and 1205
// (ER_LOCK_WAIT_TIMEOUT — a lock was held longer than lock_wait_timeout).
// Both are NORMAL under concurrency (two machines writing related rows), not
// bugs: the operation simply needs to be retried. Wrapping multi-statement
// money writes in withRetry turns a peak-hour deadlock into a silent retry
// instead of an error surfaced to the cashier.
//
// Retrying is only safe when the wrapped operation is transactional (see
// collections.ts createCollection, which commits on one connection), so a
// retried attempt starts clean and can't double-write.
export function isLockRetryable(err: unknown): boolean {
  const e = err as { errno?: number; code?: string };
  return (
    e?.errno === 1213 ||
    e?.errno === 1205 ||
    e?.code === 'ER_LOCK_DEADLOCK' ||
    e?.code === 'ER_LOCK_WAIT_TIMEOUT'
  );
}

/**
 * Runs `fn`, retrying up to `attempts` times when MySQL reports a deadlock or
 * lock-wait timeout (1213 / 1205). Any other error propagates immediately.
 * A short linear backoff gives the winning transaction time to commit.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; delayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delayMs = Math.max(0, opts.delayMs ?? 30);
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isLockRetryable(err)) throw err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}
