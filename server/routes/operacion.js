// Rutas de cocina y caja (requieren sesión; cada una exige su rol, el admin entra a todo).
import { Router } from 'express';
import { exigirRol } from '../auth.js';
import { query, tx } from '../db.js';
import { ErrorHttp, entero, listaItems, notaItem } from '../util.js';

export const rutasOperacion = Router();

const soloCocina = exigirRol('cocina', 'admin');
const soloCaja = exigirRol('caja', 'admin');

const MINUTOS = 'GREATEST(0, floor(extract(epoch FROM (now() - creado_en)) / 60))::int';

/** Agrega los renglones (con su nota) a una lista de pedidos. */
async function conDetalle(peds) {
  if (peds.length === 0) return [];

  const { rows: dets } = await query(
    `SELECT id, pedido_id, nombre, cantidad, precio_unitario, nota
       FROM detalle_pedido
      WHERE pedido_id = ANY($1::int[])
      ORDER BY id`,
    [peds.map((p) => p.id)],
  );

  const porPedido = new Map();
  for (const d of dets) {
    if (!porPedido.has(d.pedido_id)) porPedido.set(d.pedido_id, []);
    porPedido.get(d.pedido_id).push({
      id: d.id,
      nombre: d.nombre,
      cant: d.cantidad,
      precio: Number(d.precio_unitario),
      nota: d.nota ?? '',
    });
  }

  return peds.map((p) => ({
    id: p.id,
    mesa: p.mesa,
    nombre: p.nombre,
    estado: p.estado,
    creadoEn: p.creado_en,
    listoEn: p.listo_en ?? null,
    min: p.min,
    minLista: p.min_lista ?? null,
    items: porPedido.get(p.id) ?? [],
  }));
}

async function pedidosConDetalle(estados) {
  const { rows } = await query(
    `SELECT id, mesa, nombre, estado, creado_en, listo_en, ${MINUTOS} AS min,
            CASE WHEN listo_en IS NULL THEN NULL
                 ELSE GREATEST(0, floor(extract(epoch FROM (now() - listo_en)) / 60))::int END AS min_lista
       FROM pedidos
      WHERE estado = ANY($1::text[])
      ORDER BY creado_en`,
    [estados],
  );
  return conDetalle(rows);
}

/* ---------- Cocina ---------- */

rutasOperacion.get('/cocina/pedidos', soloCocina, async (_req, res) => {
  res.json(await pedidosConDetalle(['nueva', 'preparando']));
});

/** Historial de las últimas 24 h: pedidos que cocina marcó como listos (aún por cobrar o ya cobrados). */
rutasOperacion.get('/cocina/historial', soloCocina, async (_req, res) => {
  const { rows } = await query(
    `SELECT id, mesa, nombre, estado, creado_en, listo_en, ${MINUTOS} AS min,
            GREATEST(0, floor(extract(epoch FROM (now() - listo_en)) / 60))::int AS min_lista
       FROM pedidos
      WHERE estado IN ('lista','cobrada')
        AND listo_en IS NOT NULL
        AND listo_en >= now() - interval '24 hours'
      ORDER BY listo_en DESC
      LIMIT 60`,
  );
  res.json(await conDetalle(rows));
});

// destino -> estados de partida permitidos.
// «preparando» desde «lista» es el DESHACER/RESTAURAR (no se restaura un pedido ya cobrado).
const TRANSICIONES = { preparando: ['nueva', 'lista'], lista: ['preparando'] };

rutasOperacion.patch('/pedidos/:id/estado', exigirRol('cocina', 'caja', 'admin'), async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const destino = req.body?.estado;
  if (typeof destino !== 'string' || !Object.hasOwn(TRANSICIONES, destino)) throw new ErrorHttp(422, 'Estado no válido.');

  const { rows: act } = await query('SELECT estado FROM pedidos WHERE id = $1', [id]);
  if (!act[0]) throw new ErrorHttp(404, 'El pedido no existe.');

  // Caja solo puede devolver a cocina un pedido listo (por un reclamo); lo demás es de cocina.
  const esRestaurar = destino === 'preparando' && act[0].estado === 'lista';
  if (req.usuario.rol === 'caja' && !esRestaurar) throw new ErrorHttp(403, 'Tu rol no puede cambiar este estado.');

  const { rowCount } = await query(
    `UPDATE pedidos
        SET estado = $2::text,
            listo_en = CASE WHEN $2::text = 'lista' THEN now() ELSE NULL END
      WHERE id = $1 AND estado = ANY($3::text[])`,
    [id, destino, TRANSICIONES[destino]],
  );
  if (rowCount === 0 && act[0].estado !== destino) {
    throw new ErrorHttp(409, 'El pedido ya cambió de estado. Se actualizará la pantalla.');
  }
  res.json({ ok: true });
});

/* ---------- Caja ---------- */

rutasOperacion.get('/caja', soloCaja, async (_req, res) => {
  const [pedidos, llamadas] = await Promise.all([
    pedidosConDetalle(['nueva', 'preparando', 'lista']),
    query(
      `SELECT id, mesa,
              GREATEST(0, floor(extract(epoch FROM (now() - creado_en)) / 60))::int AS min
         FROM llamadas_mesero
        WHERE NOT atendida
        ORDER BY creado_en`,
    ),
  ]);
  res.json({ pedidos, llamadas: llamadas.rows });
});

/** Aplica correcciones: actualiza cantidades y notas, y elimina los renglones quitados. */
rutasOperacion.put('/pedidos/:id/items', soloCaja, async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const items = listaItems(req.body?.items);

  await tx(async (q) => {
    const { rows: ped } = await q('SELECT estado FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
    if (!ped[0]) throw new ErrorHttp(404, 'El pedido no existe.');
    if (ped[0].estado === 'cobrada') throw new ErrorHttp(409, 'El pedido ya fue cobrado.');

    const { rows: dets } = await q('SELECT id FROM detalle_pedido WHERE pedido_id = $1', [id]);
    for (const d of dets) {
      const nuevo = items.get(d.id);
      if (nuevo) await q('UPDATE detalle_pedido SET cantidad = $2, nota = $3 WHERE id = $1', [d.id, nuevo.cant, nuevo.nota]);
      else await q('DELETE FROM detalle_pedido WHERE id = $1', [d.id]);
    }
  });
  res.json({ ok: true });
});

/** Agrega un platillo a un pedido abierto (si ya está con la misma nota, suma la cantidad). */
rutasOperacion.post('/pedidos/:id/items', soloCaja, async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const platilloId = entero(req.body?.platilloId, 'platillo', 1, 2_000_000_000);
  const cant = entero(req.body?.cant, 'cantidad', 1, 50);
  const nota = notaItem(req.body?.nota);

  await tx(async (q) => {
    const { rows: ped } = await q('SELECT estado FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
    if (!ped[0]) throw new ErrorHttp(404, 'El pedido no existe.');
    if (ped[0].estado === 'cobrada') throw new ErrorHttp(409, 'El pedido ya fue cobrado.');

    const { rows: pl } = await q('SELECT id, nombre, precio FROM platillos WHERE id = $1 AND disponible', [platilloId]);
    if (!pl[0]) throw new ErrorHttp(422, 'Ese platillo no está disponible.');

    const { rows: ya } = await q(
      "SELECT id FROM detalle_pedido WHERE pedido_id = $1 AND platillo_id = $2 AND COALESCE(nota, '') = $3",
      [id, platilloId, nota ?? ''],
    );
    if (ya[0]) {
      await q('UPDATE detalle_pedido SET cantidad = LEAST(50, cantidad + $2) WHERE id = $1', [ya[0].id, cant]);
    } else {
      await q(
        'INSERT INTO detalle_pedido (pedido_id, platillo_id, nombre, precio_unitario, cantidad, nota) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, pl[0].id, pl[0].nombre, pl[0].precio, cant, nota],
      );
    }
  });
  res.status(201).json({ ok: true });
});

rutasOperacion.post('/pedidos/:id/cobrar', soloCaja, async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);

  await tx(async (q) => {
    const { rows } = await q('SELECT estado FROM pedidos WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new ErrorHttp(404, 'El pedido no existe.');
    if (rows[0].estado === 'cobrada') throw new ErrorHttp(409, 'El pedido ya fue cobrado.');

    const { rows: n } = await q('SELECT count(*)::int AS n FROM detalle_pedido WHERE pedido_id = $1', [id]);
    if (n[0].n === 0) throw new ErrorHttp(422, 'El pedido no tiene platillos.');

    await q("UPDATE pedidos SET estado = 'cobrada' WHERE id = $1", [id]);
  });
  res.json({ ok: true });
});

rutasOperacion.patch('/llamadas/:id', soloCaja, async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  await query('UPDATE llamadas_mesero SET atendida = TRUE WHERE id = $1', [id]);
  res.json({ ok: true });
});
