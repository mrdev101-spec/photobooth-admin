import { drizzle, type MySql2Database } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import { attachDatabasePool } from '@vercel/functions';
import * as schema from './schema';

export type Db = MySql2Database<typeof schema>;

const globalForDb = globalThis as unknown as { __pbPool?: mysql.Pool; __pbDb?: Db };

/**
 * One small pool per function instance (Vercel Fluid compute reuses instances, so keep the
 * pool module-global and let attachDatabasePool close idle connections before suspension).
 * Created lazily so `next build` works without DATABASE_URL.
 */
export function db(): Db {
  if (globalForDb.__pbDb) return globalForDb.__pbDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    maxIdle: 2,
    idleTimeout: 30_000,
    enableKeepAlive: true,
    timezone: 'Z', // store and read DATETIME as UTC
    dateStrings: false,
    charset: 'utf8mb4_unicode_ci',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined
  });
  pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  try {
    // Vercel recognises mysql2's core pool (the promise wrapper keeps it at `.pool`)
    attachDatabasePool(pool.pool);
  } catch (err) {
    console.warn('[db] attachDatabasePool skipped:', err instanceof Error ? err.message : err);
  }
  globalForDb.__pbPool = pool;
  globalForDb.__pbDb = drizzle(pool, { schema, mode: 'default' });
  return globalForDb.__pbDb;
}
