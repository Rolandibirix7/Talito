import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { exigirRol, exigirSesion, rutasAuth } from './auth.js';
import { nombreDb } from './db.js';
import { rutasAdmin } from './routes/admin.js';
import { rutasOperacion } from './routes/operacion.js';
import { rutasPublicas } from './routes/publico.js';
import { ErrorHttp } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'client', 'dist');

export function crearApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render va detrás de un proxy

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  // Subida de foto de platillo (JSON con la imagen en base64): único lugar que admite cuerpos grandes.
  app.use('/api/admin/platillos/:id/foto', express.json({ limit: '1mb' }));
  app.use(express.json({ limit: '50kb' }));
  app.use(cookieParser());

  // Defensa CSRF: las peticiones que modifican datos deben ser JSON
  // (un formulario de otro sitio no puede enviar ese tipo de contenido).
  app.use('/api', (req, _res, next) => {
    const modifica = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const sinCuerpo = req.path === '/auth/logout';
    if (modifica && !sinCuerpo && !req.is('application/json')) {
      return next(new ErrorHttp(415, 'Se esperaba contenido JSON.'));
    }
    next();
  });

  app.get('/api/salud', (_req, res) => res.json({ ok: true, db: nombreDb() }));

  app.use('/api/auth', rutasAuth);
  app.use('/api', rutasPublicas);
  app.use('/api', exigirSesion, rutasOperacion);
  app.use('/api/admin', exigirSesion, exigirRol('admin'), rutasAdmin);

  app.use('/api', (_req, _res, next) => next(new ErrorHttp(404, 'Ruta no encontrada.')));

  // Frontend compilado (React) + rutas del lado del cliente
  app.use(express.static(DIST, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.sendFile(path.join(DIST, 'index.html'), (err) => {
      if (err) next(new ErrorHttp(404, 'Primero compila el frontend: npm run build'));
    });
  });

  // Manejo central de errores
  app.use((err, _req, res, _next) => {
    if (err instanceof ErrorHttp) return res.status(err.status).json({ message: err.message });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'JSON mal formado.' });
    if (err?.type === 'entity.too.large') return res.status(413).json({ message: 'La solicitud es demasiado grande.' });
    if (err?.code === '23505') return res.status(409).json({ message: 'Ya existe un registro con esos datos.' });
    if (err?.code === '23503') return res.status(409).json({ message: 'El registro está relacionado con otros datos.' });

    console.error(err);
    res.status(500).json({ message: 'Error interno del servidor.' });
  });

  return app;
}
