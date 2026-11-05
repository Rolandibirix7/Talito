import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import { query } from './db.js';
import { ErrorHttp, limitar, texto } from './util.js';

const COOKIE = 'talito_token';
export const ROLES = ['admin', 'caja', 'cocina'];
const DURACION_MS = 12 * 60 * 60 * 1000;
const produccion = process.env.NODE_ENV === 'production';

let SECRETO = process.env.JWT_SECRET;
if (!SECRETO) {
  if (produccion) {
    console.error('Falta la variable de entorno JWT_SECRET (obligatoria en producción).');
    process.exit(1);
  }
  SECRETO = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET no definido: se usa uno temporal (las sesiones se pierden al reiniciar).');
}

// Hash falso para igualar el tiempo de respuesta cuando el correo no existe
const HASH_FALSO = bcrypt.hashSync('contraseña-inexistente', 10);

export function exigirSesion(req, _res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return next(new ErrorHttp(401, 'Inicia sesión para continuar.'));
  try {
    req.usuario = jwt.verify(token, SECRETO);
    // Sesiones anteriores a los roles no traen «rol»: se pide iniciar sesión de nuevo.
    if (!ROLES.includes(req.usuario.rol)) return next(new ErrorHttp(401, 'Inicia sesión de nuevo.'));
    next();
  } catch {
    next(new ErrorHttp(401, 'Tu sesión expiró. Inicia sesión de nuevo.'));
  }
}

/** Deja pasar solo a los roles indicados (el admin entra a todo lo que se le indique aquí). */
export const exigirRol = (...permitidos) => (req, _res, next) =>
  permitidos.includes(req.usuario?.rol) ? next() : next(new ErrorHttp(403, 'Tu rol no tiene acceso a esta sección.'));

export const rutasAuth = Router();

rutasAuth.post(
  '/login',
  limitar({
    max: 8,
    ventanaMs: 60_000,
    clave: (req) => `${req.ip}|${String(req.body?.correo ?? '').toLowerCase()}`,
    mensaje: 'Demasiados intentos. Espera un minuto.',
  }),
  async (req, res) => {
    const correo = texto(req.body?.correo, 'correo', 120).toLowerCase();
    const clave = texto(req.body?.clave, 'contraseña', 100);

    const { rows } = await query('SELECT id, nombre, correo, rol, clave_hash FROM usuarios WHERE correo = $1', [correo]);
    const u = rows[0];
    const ok = await bcrypt.compare(clave, u?.clave_hash ?? HASH_FALSO);
    if (!u || !ok) throw new ErrorHttp(401, 'Correo o contraseña incorrectos.');

    const token = jwt.sign({ sub: u.id, nombre: u.nombre, correo: u.correo, rol: u.rol }, SECRETO, { expiresIn: '12h' });
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: produccion,
      maxAge: DURACION_MS,
    });
    res.json({ nombre: u.nombre, correo: u.correo, rol: u.rol });
  },
);

rutasAuth.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: produccion });
  res.json({ ok: true });
});

rutasAuth.get('/me', exigirSesion, (req, res) => {
  res.json({ nombre: req.usuario.nombre, correo: req.usuario.correo, rol: req.usuario.rol });
});
