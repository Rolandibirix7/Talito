import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { rutaInicio } from '../api.js';
import { useAuth } from '../auth.jsx';
import Marca from '../components/Marca.jsx';

export default function Login() {
  const { usuario, entrar } = useAuth();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const desde = ubicacion.state?.desde;

  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to={desde || rutaInicio(usuario.rol)} replace />;

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const u = await entrar(correo, clave);
      navegar(desde || rutaInicio(u.rol), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <div className="login-lado">
        <Marca />
        <div>
          <h1>Todo el restaurante, en un solo panel.</h1>
          <p>Cocina, caja, menú y métricas de venta para el personal autorizado.</p>
        </div>
        <p>Acceso solo para personal autorizado.</p>
      </div>

      <div className="login-form">
        <form onSubmit={enviar}>
          <h2>Iniciar sesión</h2>
          <p className="sub">Ingresa con tu correo y contraseña.</p>

          {error && <div className="error-msg" role="alert">{error}</div>}

          <div className="campo">
            <label htmlFor="correo">Correo</label>
            <input id="correo" type="email" autoComplete="username" required value={correo} onChange={(e) => setCorreo(e.target.value)} />
          </div>
          <div className="campo">
            <label htmlFor="clave">Contraseña</label>
            <input id="clave" type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
