// Datos iniciales. Cada bloque solo se inserta si la tabla está vacía,
// así se puede ejecutar en cada arranque sin duplicar nada.
import bcrypt from 'bcryptjs';
import { query, tx } from './db.js';

const MENU = [
  ['Entradas', 'entradas', [
    ['Pupusas revueltas', 'Dos pupusas de chicharrón con queso, con curtido y salsa roja.', 1.5, true],
    ['Yuca frita con chicharrón', 'Yuca dorada, chicharrón crujiente y pico de gallo.', 3.75, true],
    ['Empanadas de plátano', 'Rellenas de frijol con crema. Porción de tres.', 2.5, true],
  ]],
  ['Platos fuertes', 'fuertes', [
    ['Casamiento con huevo', 'Arroz con frijoles, huevo al gusto, plátano y crema.', 3.25, true],
    ['Pollo encebollado', 'Pechuga en salsa de cebolla, arroz y ensalada fresca.', 5.5, true],
    ['Lomo a la plancha', 'Corte de res con chimol, frijol molido y tortillas.', 7.25, false],
    ['Sopa de gallina', 'Caldo casero con verduras, arroz y tortillas calientes.', 4.0, true],
  ]],
  ['Bebidas', 'bebidas', [
    ['Horchata', 'Vaso grande, con canela y semilla de morro.', 1.0, true],
    ['Refresco de tamarindo', 'Natural, con hielo.', 1.25, true],
    ['Café de olla', 'Con panela y canela.', 1.0, true],
  ]],
  ['Postres', 'postres', [
    ['Plátanos fritos con crema', 'Con frijoles dulces y un toque de azúcar.', 2.25, true],
    ['Quesadilla salvadoreña', 'Rebanada tibia, con semillas de ajonjolí.', 1.75, true],
  ]],
];

const NOMBRES = ['Carlos', 'Ana', 'Familia Rivas', 'Lucía', 'Mario', 'Sofía', 'Diego', 'Elena'];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

export async function sembrar({ conDemo = true } = {}) {
  // Administrador inicial (configurable por variables de entorno)
  const { rows: u } = await query('SELECT count(*)::int AS n FROM usuarios');
  if (u[0].n === 0) {
    // En producción nunca se crea un administrador con una contraseña conocida.
    if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
      throw new Error('Define la variable ADMIN_PASSWORD (y ADMIN_EMAIL) para crear el primer administrador.');
    }
    const correo = process.env.ADMIN_EMAIL || 'admin@talito.test';
    const clave = process.env.ADMIN_PASSWORD || 'admin1234';
    const hash = await bcrypt.hash(clave, 10);
    await query('INSERT INTO usuarios (nombre, correo, clave_hash) VALUES ($1,$2,$3)', [
      'Administrador principal', correo, hash,
    ]);
    console.log(`  · Administrador creado: ${correo}`);

    // Solo en desarrollo: cuentas de prueba para cocina y caja (en producción las crea el admin).
    if (process.env.NODE_ENV !== 'production') {
      for (const [nombre, mail, pass, rol] of [
        ['Cocina (prueba)', 'cocina@talito.test', 'cocina1234', 'cocina'],
        ['Caja (prueba)', 'caja@talito.test', 'caja1234', 'caja'],
      ]) {
        await query('INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES ($1,$2,$3,$4)', [
          nombre, mail, await bcrypt.hash(pass, 10), rol,
        ]);
      }
      console.log('  · Cuentas de prueba: cocina@talito.test / cocina1234 · caja@talito.test / caja1234');
    }
  }

  // Menú
  const { rows: c } = await query('SELECT count(*)::int AS n FROM categorias');
  if (c[0].n === 0) {
    await tx(async (q) => {
      for (const [i, [nombre, slug, platillos]] of MENU.entries()) {
        const { rows } = await q('INSERT INTO categorias (nombre, slug, orden) VALUES ($1,$2,$3) RETURNING id', [nombre, slug, i]);
        for (const [nom, desc, precio, disp] of platillos) {
          await q('INSERT INTO platillos (categoria_id, nombre, descripcion, precio, disponible) VALUES ($1,$2,$3,$4,$5)',
            [rows[0].id, nom, desc, precio, disp]);
        }
      }
    });
    console.log('  · Menú de ejemplo cargado');
  }

  // Pedidos de demostración (historial para las gráficas + pedidos activos)
  const { rows: p } = await query('SELECT count(*)::int AS n FROM pedidos');
  if (conDemo && p[0].n === 0) {
    const { rows: disp } = await query('SELECT id, nombre, precio FROM platillos WHERE disponible');

    await tx(async (q) => {
      for (let m = 5; m >= 0; m--) {
        const cuantos = 40 + (5 - m) * 8;
        for (let i = 0; i < cuantos; i++) {
          const dias = m * 30 + rnd(0, 26);
          const { rows } = await q(
            `INSERT INTO pedidos (mesa, nombre, estado, creado_en)
             VALUES ($1,$2,'cobrada', now() - make_interval(days => $3, mins => $4)) RETURNING id`,
            [rnd(1, 12), NOMBRES[rnd(0, NOMBRES.length - 1)], dias, rnd(0, 600)],
          );
          const cuantosPlatos = rnd(1, 3);
          const usados = [...disp].sort(() => Math.random() - 0.5).slice(0, cuantosPlatos);
          for (const pl of usados) {
            await q('INSERT INTO detalle_pedido (pedido_id, platillo_id, nombre, precio_unitario, cantidad) VALUES ($1,$2,$3,$4,$5)',
              [rows[0].id, pl.id, pl.nombre, pl.precio, rnd(1, 3)]);
          }
        }
      }

      const activos = [
        [4, 'Carlos', 'nueva', 3, [['Pupusas revueltas', 4, 'Curtido aparte'], ['Horchata', 2]]],
        [7, 'Familia Rivas', 'nueva', 6, [['Pollo encebollado', 2, 'Sin cebolla'], ['Sopa de gallina', 1], ['Refresco de tamarindo', 3]]],
        [2, 'Ana', 'preparando', 14, [['Casamiento con huevo', 1], ['Café de olla', 2]]],
      ];
      for (const [mesa, nombre, estado, min, items] of activos) {
        const { rows } = await q(
          `INSERT INTO pedidos (mesa, nombre, estado, creado_en)
           VALUES ($1,$2,$3, now() - make_interval(mins => $4)) RETURNING id`,
          [mesa, nombre, estado, min],
        );
        for (const [nom, cant, nota] of items) {
          const pl = disp.find((x) => x.nombre === nom);
          await q('INSERT INTO detalle_pedido (pedido_id, platillo_id, nombre, precio_unitario, cantidad, nota) VALUES ($1,$2,$3,$4,$5,$6)',
            [rows[0].id, pl?.id ?? null, nom, pl?.precio ?? 0, cant, nota ?? null]);
        }
      }
    });
    console.log('  · Pedidos de demostración cargados');
  }
}
