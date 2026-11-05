import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, rutaInicio } from './api.js';

const Contexto = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(undefined); // undefined = comprobando

  useEffect(() => {
    api('/auth/me').then(setUsuario).catch(() => setUsuario(null));
    const alPerderSesion = () => setUsuario(null);
    window.addEventListener('talito:sin-sesion', alPerderSesion);
    return () => window.removeEventListener('talito:sin-sesion', alPerderSesion);
  }, []);

  const entrar = useCallback(async (correo, clave) => {
    const u = await api('/auth/login', { method: 'POST', body: { correo, clave } });
    setUsuario(u);
    return u;
  }, []);

  const salir = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUsuario(null);
  }, []);

  const valor = useMemo(() => ({ usuario, entrar, salir }), [usuario, entrar, salir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useAuth = () => useContext(Contexto);

/** Exige sesión y, si se indican `roles`, que el rol del usuario esté entre ellos. */
export function ExigirSesion({ roles }) {
  const { usuario } = useAuth();
  const ubicacion = useLocation();

  if (usuario === undefined) return <p className="cargando centro">Comprobando sesión…</p>;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: ubicacion.pathname }} />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to={rutaInicio(usuario.rol)} replace />;
  return <Outlet />;
}
