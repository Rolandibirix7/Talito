// Cliente HTTP mínimo. Todas las rutas son relativas: /api/...
export async function api(ruta, { method = 'GET', body } = {}) {
  const opciones = { method, credentials: 'same-origin' };
  if (method !== 'GET') {
    opciones.headers = { 'Content-Type': 'application/json' };
    opciones.body = JSON.stringify(body ?? {});
  }

  let r;
  try {
    r = await fetch(`/api${ruta}`, opciones);
  } catch {
    const e = new Error('No hay conexión con el servidor.');
    e.status = 0;
    throw e;
  }

  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.message || 'No se pudo completar la acción.');
    e.status = r.status;
    if (r.status === 401 && ruta !== '/auth/login') window.dispatchEvent(new Event('talito:sin-sesion'));
    throw e;
  }
  return datos;
}

export const dinero = (n) => `$${Number(n).toFixed(2)}`;

export const hora = (iso) =>
  new Date(iso).toLocaleTimeString('es-SV', { hour: '2-digit', minute: '2-digit', hour12: false });

export const fecha = (iso) => new Date(iso).toLocaleDateString('es-SV');

// localStorage puede fallar (modo privado, bloqueado): nunca debe romper la app.
export function leerLocal(clave, defecto, almacen = 'localStorage') {
  try {
    const v = window[almacen].getItem(clave);
    return v === null ? defecto : JSON.parse(v);
  } catch {
    return defecto;
  }
}
export function guardarLocal(clave, valor, almacen = 'localStorage') {
  try {
    window[almacen].setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin almacenamiento: se ignora */
  }
}

/** Pantalla de inicio de cada rol. */
export const rutaInicio = (rol) => ({ admin: '/admin', caja: '/caja', cocina: '/cocina' })[rol] ?? '/login';

export const ETIQUETA_ROL = { admin: 'Administrador', caja: 'Caja', cocina: 'Cocina' };

/**
 * Reduce una foto (máx. `lado` px, JPEG) antes de subirla: una foto de celular pesa varios MB
 * y la base gratuita tiene poco espacio. Devuelve una data URL.
 */
export function reducirImagen(archivo, lado = 800, calidad = 0.82) {
  return new Promise((resolve, reject) => {
    if (!archivo?.type?.startsWith('image/')) return reject(new Error('El archivo no es una imagen.'));
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      img.onload = () => {
        const escala = Math.min(1, lado / Math.max(img.width, img.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.width * escala);
        lienzo.height = Math.round(img.height * escala);
        const ctx = lienzo.getContext('2d');
        ctx.fillStyle = '#fff'; // los PNG transparentes no quedan negros al pasar a JPEG
        ctx.fillRect(0, 0, lienzo.width, lienzo.height);
        ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        resolve(lienzo.toDataURL('image/jpeg', calidad));
      };
      img.src = lector.result; // data: URL (permitida por la política de seguridad)
    };
    lector.readAsDataURL(archivo);
  });
}
