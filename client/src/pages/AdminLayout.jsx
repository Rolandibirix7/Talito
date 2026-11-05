import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import Marca from '../components/Marca.jsx';

const icono = (d) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

const claseEnlace = ({ isActive }) => (isActive ? 'activo' : undefined);

export default function AdminLayout() {
  const { usuario, salir } = useAuth();

  return (
    <div className="ad-layout">
      <nav className="ad-nav" aria-label="Administración">
        <Marca />
        <NavLink to="/admin" end className={claseEnlace}>{icono('M4 20V10M10 20V4M16 20v-7M22 20H2')}Métricas</NavLink>
        <NavLink to="/admin/menu" className={claseEnlace}>{icono('M4 6h16M4 12h16M4 18h10')}Menú</NavLink>
        <NavLink to="/admin/usuarios" className={claseEnlace}>{icono('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6')}Usuarios y roles</NavLink>
        <NavLink to="/cocina">{icono('M4 11h16M5 11a7 7 0 0 0 14 0')}Cocina</NavLink>
        <NavLink to="/caja">{icono('M3 7h18v12H3zM3 11h18')}Caja</NavLink>
        <div className="usuario">{usuario?.nombre}</div>
        <div className="salir">
          <button type="button" className="btn-salir" onClick={salir}>Cerrar sesión</button>
        </div>
      </nav>

      <main className="ad-main">
        <Outlet />
      </main>
    </div>
  );
}
