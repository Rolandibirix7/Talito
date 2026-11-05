import './env.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearApp } from './app.js';
import { cerrarDb, exec, iniciarDb, nombreDb } from './db.js';
import { sembrar } from './seed.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PUERTO = Number(process.env.PORT) || 3000;

try {
  await iniciarDb();
  console.log(`Base de datos: ${nombreDb()}`);

  // En Render gratuito no hay consola: el servidor crea las tablas al arrancar.
  if (process.env.AUTO_INIT !== 'false') {
    await exec(await readFile(path.join(dir, 'schema.sql'), 'utf8'));
    await sembrar({ conDemo: process.env.SEED_DEMO !== 'false' });
  }
} catch (err) {
  console.error('\nNo se pudo preparar la base de datos:', err.message);
  if (process.env.DATABASE_URL && !/ADMIN_PASSWORD/.test(err.message)) {
    console.error('Revisa DATABASE_URL (en Neon: «Connection string») y que la base esté activa.');
  }
  process.exit(1);
}

const servidor = crearApp().listen(PUERTO, () => {
  console.log(`TA'LITO escuchando en http://localhost:${PUERTO}`);
});

const apagar = () => {
  servidor.close(async () => {
    await cerrarDb();
    process.exit(0);
  });
};
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
