// MySQL connection manager for PTA CD. Connects to the SAME database as TapIn
// School (tapin_school by default) so students/guardians/sections are shared.
// Keeps a pool alive and self-heals with a retry loop (offline-first).
import { createPool, type Pool } from 'mysql2/promise';
import { EventEmitter } from 'events';
import { loadEnvFile } from './env';
import type { PtaDbStatus } from '../../shared/types';

// Load .env (DB_HOST, DB_USER, ...) before any connection is attempted.
loadEnvFile();

interface DbConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function getConfig(): DbConfig {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'tapin_school',
  };
}

class Database extends EventEmitter {
  private pool: Pool | null = null;
  private online = false;
  private detail = 'Not connected';
  private cfg: DbConfig | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.connect();
  }

  async connect(): Promise<boolean> {
    if (this.online) return true;
    const cfg = getConfig();
    this.cfg = cfg;
    try {
      const pool = createPool({
        ...cfg,
        waitForConnections: true,
        connectionLimit: 5,
        connectTimeout: 4000,
        enableKeepAlive: true,
        // Keep DATE/DATETIME as strings so renderer code (slice, format) works.
        dateStrings: true,
      });
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      this.pool = pool;
      this.setOnline(true, `MySQL ${cfg.host}:${cfg.port} connected`);
      return true;
    } catch (err) {
      this.pool?.end().catch(() => undefined);
      this.pool = null;
      this.setOnline(false, `MySQL ${cfg.host}:${cfg.port} unreachable — ${(err as Error).message}`);
      this.scheduleRetry();
      return false;
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.connect();
    }, 5000);
  }

  private setOnline(online: boolean, detail: string): void {
    if (this.online !== online || this.detail !== detail) {
      this.online = online;
      this.detail = detail;
      this.emit('status', this.getStatus());
    }
  }

  isOnline(): boolean {
    return this.online;
  }

  getStatus(): PtaDbStatus {
    const cfg = this.cfg ?? getConfig();
    return {
      online: this.online,
      detail: this.detail,
      host: cfg.host,
      port: cfg.port,
      database: cfg.database,
    };
  }

  private requirePool(): Pool {
    if (!this.pool) throw new Error('Database is offline');
    return this.pool;
  }

  async query<T>(sql: string, params?: unknown[]): Promise<T> {
    const [rows] = await this.requirePool().query(sql, params as never);
    return rows as T;
  }

  async execute(sql: string, params?: unknown[]): Promise<{ insertId: number; affectedRows: number }> {
    const [result] = await this.requirePool().execute(sql, params as never);
    return {
      insertId: (result as { insertId: number }).insertId,
      affectedRows: (result as { affectedRows: number }).affectedRows,
    };
  }

  async stop(): Promise<void> {
    if (this.pool) {
      await this.pool.end().catch(() => undefined);
      this.pool = null;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }
}

export const db = new Database();
