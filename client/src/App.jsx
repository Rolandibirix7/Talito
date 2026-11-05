import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, ExigirSesion } from './auth.jsx';
import AdminLayout from './pages/AdminLayout.jsx';
import Caja from './pages/Caja.jsx';
import Cocina from './pages/Cocina.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Login from './pages/Login.jsx';
import MenuAdmin from './pages/MenuAdmin.jsx';
import MenuCliente from './pages/MenuCliente.jsx';
import Usuarios from './pages/Usuarios.jsx';

function NoEncontrada() {
  return (
    <main className="centro pagina-vacia">
      <div>
        <h1>404</h1>
        <p>Esta página no existe.</p>
        <p style={{ marginTop: 16 }}>
          <Link className="btn btn-primary" to="/menu">Ir al menú</Link>
        </p>
      </div>
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/menu" replace />} />
        <Route path="/menu" element={<MenuCliente />} />
        <Route path="/login" element={<Login />} />

        <Route element={<ExigirSesion roles={['cocina', 'admin']} />}>
          <Route path="/cocina" element={<Cocina />} />
        </Route>
        <Route element={<ExigirSesion roles={['caja', 'admin']} />}>
          <Route path="/caja" element={<Caja />} />
        </Route>
        <Route element={<ExigirSesion roles={['admin']} />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="menu" element={<MenuAdmin />} />
            <Route path="usuarios" element={<Usuarios />} />
          </Route>
        </Route>

        <Route path="*" element={<NoEncontrada />} />
      </Routes>
    </AuthProvider>
  );
}
