// Utilidades de validación y límite de peticiones (sin dependencias extra).

export class ErrorHttp extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function texto(valor, campo, max, { requerido = true } = {}) {
  const v = typeof valor === 'string' ? valor.trim() : '';
  if (!v) {
    if (requerido) throw new ErrorHttp(422, `Falta el campo «${campo}».`);
    return null;
  }
  if (v.length > max) throw new ErrorHttp(422, `«${campo}» admite como máximo ${max} caracteres.`);
  return v;
}

export function entero(valor, campo, min, max) {
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErrorHttp(422, `«${campo}» debe ser un número entero entre ${min} y ${max}.`);
  }
  return n;
}

export function decimal(valor, campo, min, max) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw new ErrorHttp(422, `«${campo}» debe estar entre ${min} y ${max}.`);
  }
  return Math.round(n * 100) / 100;
}

export function listaItems(valor, { max = 40 } = {}) {
  if (!Array.isArray(valor) || valor.length > max) {
    throw new ErrorHttp(422, 'La lista de platillos no es válida.');
  }
  // Une los renglones repetidos del mismo id
  const mapa = new Map();
  for (const it of valor) {
    const id = entero(it?.id, 'id', 1, 2_000_000_000);
    const cant = entero(it?.cant, 'cantidad', 1, 50);
    const nota = notaItem(it?.nota);
    const previo = mapa.get(id);
    mapa.set(id, {
      cant: Math.min(50, (previo?.cant ?? 0) + cant),
      nota: nota ?? previo?.nota ?? null,
    });
  }
  return mapa; // id -> { cant, nota }
}

/** Nota o modificador de un platillo («Sin cebolla»). Vacío = sin nota. */
export function notaItem(valor) {
  if (valor === undefined || valor === null) return null;
  return texto(valor, 'nota', 120, { requerido: false });
}

/** Limitador simple en memoria: máx. `max` peticiones por `ventanaMs` por clave. */
export function limitar({ max, ventanaMs, clave = (req) => req.ip, mensaje = 'Demasiadas solicitudes. Intenta en un momento.' }) {
  const golpes = new Map();

  setInterval(() => {
    const ahora = Date.now();
    for (const [k, v] of golpes) if (v.hasta < ahora) golpes.delete(k);
  }, ventanaMs).unref();

  return (req, res, next) => {
    const k = clave(req);
    const ahora = Date.now();
    let reg = golpes.get(k);
    if (!reg || reg.hasta < ahora) {
      reg = { n: 0, hasta: ahora + ventanaMs };
      golpes.set(k, reg);
    }
    reg.n += 1;
    if (reg.n > max) {
      res.set('Retry-After', String(Math.ceil((reg.hasta - ahora) / 1000)));
      return res.status(429).json({ message: mensaje });
    }
    next();
  };
}
