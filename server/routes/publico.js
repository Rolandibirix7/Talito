// Rutas del cliente (sin sesión): ver el menú, enviar pedido y llamar al mesero.
import { Router } from 'express';
import { query, tx } from '../db.js';
import { ErrorHttp, entero, limitar, listaItems, texto } from '../util.js';

export const rutasPublicas = Router();

rutasPublicas.get('/menu', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.id AS cat_id, c.slug, c.nombre AS cat_nombre,
            p.id, p.nombre, p.descripcion, p.precio,
            (p.foto IS NOT NULL) AS tiene_foto, p.foto_version
       FROM categorias c
       JOIN platillos p ON p.categoria_id = c.id AND p.disponible
      ORDER BY c.orden, p.id`,
  );

  const porCategoria = new Map();
  for (const r of rows) {
    if (!porCategoria.has(r.cat_id)) {
      porCategoria.set(r.cat_id, { id: r.slug, nombre: r.cat_nombre, items: [] });
    }
    porCategoria.get(r.cat_id).items.push({
      id: r.id,
      nombre: r.nombre,
      desc: r.descripcion ?? '',
      precio: Number(r.precio),
      foto: r.tiene_foto ? `/api/platillos/${r.id}/foto?v=${r.foto_version}` : null,
    });
  }
  res.json([...porCategoria.values()]);
});

// Foto del platillo. La URL lleva ?v=<versión>, así el navegador la guarda un año sin quedar desactualizada.
rutasPublicas.get('/platillos/:id/foto', async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const { rows } = await query('SELECT foto, foto_tipo FROM platillos WHERE id = $1 AND foto IS NOT NULL', [id]);
  if (!rows[0]) throw new ErrorHttp(404, 'Sin foto.');
  res.set('Content-Type', rows[0].foto_tipo);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(rows[0].foto));
});

rutasPublicas.post(
  '/pedidos',
  limitar({ max: 15, ventanaMs: 60_000, mensaje: 'Estás enviando pedidos muy rápido. Espera un momento.' }),
  async (req, res) => {
    const nombre = texto(req.body?.nombre, 'nombre', 60);
    const mesa = entero(req.body?.mesa, 'mesa', 1, 99);
    const items = listaItems(req.body?.items);
    if (items.size === 0) throw new ErrorHttp(422, 'El pedido está vacío.');

    // El precio SIEMPRE sale de la base de datos, nunca del navegador.
    const { rows: platillos } = await query(
      'SELECT id, nombre, precio FROM platillos WHERE id = ANY($1::int[]) AND disponible',
      [[...items.keys()]],
    );
    if (platillos.length !== items.size) {
      throw new ErrorHttp(422, 'Uno de los platillos de tu pedido ya no está disponible.');
    }

    const id = await tx(async (q) => {
      const { rows } = await q(
        "INSERT INTO pedidos (mesa, nombre, estado) VALUES ($1, $2, 'nueva') RETURNING id",
        [mesa, nombre],
      );
      for (const p of platillos) {
        await q(
          'INSERT INTO detalle_pedido (pedido_id, platillo_id, nombre, precio_unitario, cantidad, nota) VALUES ($1,$2,$3,$4,$5,$6)',
          [rows[0].id, p.id, p.nombre, p.precio, items.get(p.id).cant, items.get(p.id).nota],
        );
      }
      return rows[0].id;
    });

    res.status(201).json({ ok: true, pedido: id });
  },
);

rutasPublicas.post(
  '/llamadas',
  limitar({ max: 10, ventanaMs: 60_000, mensaje: 'Ya avisamos al personal. Espera un momento.' }),
  async (req, res) => {
    const mesa = entero(req.body?.mesa, 'mesa', 1, 99);
    // Evita duplicados mientras la mesa no haya sido atendida
    await query(
      `INSERT INTO llamadas_mesero (mesa)
       SELECT $1::smallint
        WHERE NOT EXISTS (SELECT 1 FROM llamadas_mesero WHERE mesa = $1::smallint AND NOT atendida)`,
      [mesa],
    );
    res.status(201).json({ ok: true });
  },
);
