// Acceso a la base de datos.
//  - Con DATABASE_URL (Neon, Render, etc.) usa PostgreSQL real mediante "pg".
//  - Sin DATABASE_URL usa PGlite (PostgreSQL embebido) guardado en ./.data
//    para que cualquiera del equipo pueda desarrollar sin instalar nada.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let driver; // { query(text, params) -> {rows}, tx(fn), close() }

async function crearDriver() {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { default: pg } = await import('pg');
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({
      connectionString: url,
      ssl: local ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 20000,
      connectionTimeoutMillis: 15000, // Neon puede tardar unos segundos en despertar
    });

    return {
      nombre: 'PostgreSQL',
      query: (text, params) => pool.query(text, params),
      exec: (sql) => pool.query(sql), // sin parámetros admite varias sentencias
      async tx(fn) {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const r = await fn((t, p) => c.query(t, p));
          await c.query('COMMIT');
          return r;
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          c.release();
        }
      },
      close: () => pool.end(),
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const dir = process.env.PGLITE_DIR ?? path.join(__dirname, '..', '.data', 'pglite');
  const enMemoria = process.env.PGLITE_DIR === 'memory://';
  if (!enMemoria) mkdirSync(dir, { recursive: true });
  const db = enMemoria ? new PGlite() : new PGlite(dir);
  await db.waitReady;

  return {
    nombre: 'PGlite (local)',
    query: (text, params) => db.query(text, params),
    exec: (sql) => db.exec(sql),
    tx: (fn) => db.transaction((t) => fn((text, params) => t.query(text, params))),
    close: () => db.close(),
  };
}

export async function iniciarDb() {
  driver = await crearDriver();
  return driver;
}

export const query = (text, params) => driver.query(text, params);
export const exec = (sql) => driver.exec(sql);
export const tx = (fn) => driver.tx(fn);
export const cerrarDb = () => driver?.close();
export const nombreDb = () => driver?.nombre;
