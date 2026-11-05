// npm run db:init  ->  crea las tablas y carga los datos iniciales.
import '../env.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { iniciarDb, exec, cerrarDb, nombreDb } from '../db.js';
import { sembrar } from '../seed.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

await iniciarDb();
console.log(`Base de datos: ${nombreDb()}`);
await exec(await readFile(path.join(dir, '..', 'schema.sql'), 'utf8'));
console.log('  · Tablas listas');
await sembrar({ conDemo: process.env.SEED_DEMO !== 'false' });
await cerrarDb();
console.log('Listo.');
