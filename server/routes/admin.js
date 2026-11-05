// Rutas de administración (requieren sesión): métricas, menú y usuarios.
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { query } from '../db.js';
import { ROLES } from '../auth.js';
import { ErrorHttp, decimal, entero, texto } from '../util.js';

export const rutasAdmin = Router();

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ZONA = 'America/El_Salvador';

/* ---------- Métricas ---------- */

rutasAdmin.get('/metricas', async (_req, res) => {
  const [porMes, top, ventana] = await Promise.all([
    query(
      `SELECT to_char(date_trunc('month', p.creado_en AT TIME ZONE '${ZONA}'), 'YYYY-MM') AS mes,
              COALESCE(SUM(d.cantidad * d.precio_unitario), 0)::float AS ingresos,
              COUNT(DISTINCT p.id)::int AS pedidos
         FROM pedidos p
         JOIN detalle_pedido d ON d.pedido_id = p.id
        WHERE p.estado = 'cobrada'
          AND p.creado_en >= date_trunc('month', now() AT TIME ZONE '${ZONA}') - interval '5 months'
        GROUP BY 1`,
    ),
    query(
      `SELECT d.nombre, SUM(d.cantidad)::int AS total
         FROM detalle_pedido d
         JOIN pedidos p ON p.id = d.pedido_id
        WHERE p.estado = 'cobrada' AND p.creado_en >= now() - interval '30 days'
        GROUP BY d.nombre
        ORDER BY total DESC, d.nombre
        LIMIT 5`,
    ),
    // Últimos 30 días contra los 30 anteriores (evita comparar un mes recién empezado con uno completo)
    query(
      `SELECT
         COALESCE(SUM(d.cantidad * d.precio_unitario) FILTER (WHERE p.creado_en >= now() - interval '30 days'), 0)::float AS ing_act,
         COALESCE(SUM(d.cantidad * d.precio_unitario) FILTER (WHERE p.creado_en < now() - interval '30 days'), 0)::float AS ing_prev,
         COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en >= now() - interval '30 days')::int AS ped_act,
         COUNT(DISTINCT p.id) FILTER (WHERE p.creado_en < now() - interval '30 days')::int AS ped_prev
       FROM pedidos p
       JOIN detalle_pedido d ON d.pedido_id = p.id
      WHERE p.estado = 'cobrada' AND p.creado_en >= now() - interval '60 days'`,
    ),
  ]);

  // Rellena los meses sin ventas con cero
  const datos = new Map(porMes.rows.map((r) => [r.mes, r]));
  const hoy = new Date(new Date().toLocaleString('en-US', { timeZone: ZONA }));
  const meses = [];
  for (let i = 5; i >= 0; i--) {
    const f = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const clave = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
    const r = datos.get(clave);
    meses.push({
      etiqueta: MESES[f.getMonth()],
      ingresos: Math.round((r?.ingresos ?? 0) * 100) / 100,
      pedidos: r?.pedidos ?? 0,
    });
  }

  const v = ventana.rows[0];
  const variacion = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 1000) / 10 : null);

  res.json({
    meses,
    top: top.rows,
    kpis: {
      ingresos: Math.round(v.ing_act * 100) / 100,
      varIngresos: variacion(v.ing_act, v.ing_prev),
      pedidos: v.ped_act,
      varPedidos: variacion(v.ped_act, v.ped_prev),
      estrella: top.rows[0]?.nombre ?? '—',
      estrellaCant: top.rows[0]?.total ?? 0,
    },
  });
});

/* ---------- Menú ---------- */

rutasAdmin.get('/categorias', async (_req, res) => {
  const { rows } = await query('SELECT id, nombre FROM categorias ORDER BY orden');
  res.json(rows);
});

rutasAdmin.get('/platillos', async (_req, res) => {
  const { rows } = await query(
    `SELECT p.id, p.nombre, p.descripcion AS "desc", p.precio::float AS precio, p.disponible,
            p.categoria_id AS "categoriaId", c.nombre AS categoria,
            (p.foto IS NOT NULL) AS "tieneFoto", p.foto_version AS "fotoVersion"
       FROM platillos p
       JOIN categorias c ON c.id = p.categoria_id
      ORDER BY c.orden, p.id`,
  );
  res.json(
    rows.map(({ tieneFoto, fotoVersion, ...r }) => ({
      ...r,
      desc: r.desc ?? '',
      foto: tieneFoto ? `/api/platillos/${r.id}/foto?v=${fotoVersion}` : null,
    })),
  );
});

/** Crea una categoría nueva al final del menú. El «slug» (para los enlaces) se genera del nombre. */
rutasAdmin.post('/categorias', async (req, res) => {
  const nombre = texto(req.body?.nombre, 'nombre', 60);

  const { rows: dup } = await query('SELECT 1 FROM categorias WHERE lower(nombre) = lower($1)', [nombre]);
  if (dup[0]) throw new ErrorHttp(409, 'Ya existe una categoría con ese nombre.');

  const base =
    nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'categoria';
  let slug = base;
  for (let n = 2; (await query('SELECT 1 FROM categorias WHERE slug = $1', [slug])).rows[0]; n++) slug = `${base}-${n}`;

  const { rows } = await query(
    `INSERT INTO categorias (nombre, slug, orden)
     VALUES ($1, $2, COALESCE((SELECT MAX(orden) + 1 FROM categorias), 0)) RETURNING id, nombre`,
    [nombre, slug],
  );
  res.status(201).json(rows[0]);
});

function leerPlatillo(body) {
  return {
    nombre: texto(body?.nombre, 'nombre', 100),
    categoriaId: entero(body?.categoriaId, 'categoría', 1, 2_000_000_000),
    precio: decimal(body?.precio, 'precio', 0, 999),
    desc: texto(body?.desc, 'descripción', 255, { requerido: false }),
    disponible: body?.disponible !== false,
  };
}

rutasAdmin.post('/platillos', async (req, res) => {
  const p = leerPlatillo(req.body);
  const { rows } = await query(
    `INSERT INTO platillos (categoria_id, nombre, descripcion, precio, disponible)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [p.categoriaId, p.nombre, p.desc, p.precio, p.disponible],
  );
  res.status(201).json({ id: rows[0].id });
});

rutasAdmin.put('/platillos/:id', async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const p = leerPlatillo(req.body);
  const { rowCount } = await query(
    `UPDATE platillos
        SET categoria_id = $2, nombre = $3, descripcion = $4, precio = $5, disponible = $6
      WHERE id = $1`,
    [id, p.categoriaId, p.nombre, p.desc, p.precio, p.disponible],
  );
  if (rowCount === 0) throw new ErrorHttp(404, 'El platillo no existe.');
  res.json({ ok: true });
});


/** Elimina el platillo del menú. El historial no se altera: cada pedido guarda el nombre y el precio del momento. */
rutasAdmin.delete('/platillos/:id', async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const { rowCount } = await query('DELETE FROM platillos WHERE id = $1', [id]); // detalle_pedido.platillo_id pasa a NULL
  if (rowCount === 0) throw new ErrorHttp(404, 'El platillo no existe.');
  res.json({ ok: true });
});

/* ---------- Foto de platillo ---------- */

const TIPOS_FOTO = { 'image/jpeg': [0xff, 0xd8, 0xff], 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/webp': [0x52, 0x49, 0x46, 0x46] };
const MAX_FOTO = 600 * 1024; // el navegador ya la reduce (~100 KB); este es solo el tope de seguridad

rutasAdmin.put('/platillos/:id/foto', async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.body?.imagen ?? ''));
  if (!m) throw new ErrorHttp(422, 'La imagen debe ser JPG, PNG o WebP.');

  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > MAX_FOTO) throw new ErrorHttp(422, 'La imagen es demasiado grande (máx. 600 KB).');
  // Comprueba que el contenido corresponde al tipo declarado (no basta con confiar en el texto)
  if (!TIPOS_FOTO[m[1]].every((b, i) => buf[i] === b)) throw new ErrorHttp(422, 'El archivo no es una imagen válida.');

  const { rowCount } = await query(
    'UPDATE platillos SET foto = $2, foto_tipo = $3, foto_version = foto_version + 1 WHERE id = $1',
    [id, buf, m[1]],
  );
  if (rowCount === 0) throw new ErrorHttp(404, 'El platillo no existe.');
  res.json({ ok: true });
});

rutasAdmin.delete('/platillos/:id/foto', async (req, res) => {
  const id = entero(req.params.id, 'id', 1, 2_000_000_000);
  const { rowCount } = await query(
    'UPDATE platillos SET foto = NULL, foto_tipo = NULL, foto_version = foto_version + 1 WHERE id = $1',
    [id],
  );
  if (rowCount === 0) throw new ErrorHttp(404, 'El platillo no existe.');
  res.json({ ok: true });
});

/* ---------- Usuarios y roles ---------- */

rutasAdmin.get('/usuarios', async (_req, res) => {
  const { rows } = await query('SELECT id, nombre, correo, rol, creado_en AS "creadoEn" FROM usuarios ORDER BY id');
  res.json(rows);
});

rutasAdmin.post('/usuarios', async (req, res) => {
  const nombre = texto(req.body?.nombre, 'nombre', 80);
  const correo = texto(req.body?.correo, 'correo', 120).toLowerCase();
  const clave = texto(req.body?.clave, 'contraseña', 100);
  const rol = req.body?.rol;

  if (!ROLES.includes(rol)) throw new ErrorHttp(422, 'Elige un rol: administrador, caja o cocina.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorHttp(422, 'El correo no es válido.');
  if (clave.length < 8) throw new ErrorHttp(422, 'La contraseña debe tener al menos 8 caracteres.');

  const hash = await bcrypt.hash(clave, 10);
  const { rows } = await query(
    'INSERT INTO usuarios (nombre, correo, clave_hash, rol) VALUES ($1,$2,$3,$4) RETURNING id',
    [nombre, correo, hash, rol],
  );
  res.status(201).json({ id: rows[0].id });
});
