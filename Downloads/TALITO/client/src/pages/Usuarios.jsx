import { useCallback, useEffect, useState } from 'react';
import { ETIQUETA_ROL, api, fecha } from '../api.js';

export default function Usuarios() {
  const [lista, setLista] = useState(null);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [f, setF] = useState({ nombre: '', correo: '', clave: '', rol: 'cocina' });
  const [enviando, setEnviando] = useState(false);
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.value }));

  const cargar = useCallback(() => {
    api('/admin/usuarios').then(setLista).catch((e) => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);

  async function crear(e) {
    e.preventDefault();
    setError('');
    setOk('');
    setEnviando(true);
    try {
      await api('/admin/usuarios', { method: 'POST', body: f });
      setF({ nombre: '', correo: '', clave: '', rol: 'cocina' });
      setOk('Cuenta creada.');
      cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <div className="ad-cab">
        <div>
          <h1>Usuarios y roles</h1>
        </div>
      </div>

      {ok && <p className="badge ok msg-ok" role="status">{ok}</p>}
      {error && <div className="error-msg" role="alert">{error}</div>}

      <div className="grid-usuarios">
        <div className="panel tabla-scroll">
          <h2>Cuentas registradas</h2>
          {!lista ? <p className="cargando">Cargando…</p> : (
            <table className="tabla">
              <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Alta</th></tr></thead>
              <tbody>
                {lista.map((u) => (
                  <tr key={u.id}><td><strong>{u.nombre}</strong></td><td>{u.correo}</td><td><span className={`badge rol-${u.rol}`}>{ETIQUETA_ROL[u.rol]}</span></td><td>{fecha(u.creadoEn)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <form className="panel" onSubmit={crear}>
          <h2>Crear cuenta</h2>
          <div className="campo">
            <label htmlFor="u-nombre">Nombre</label>
            <input id="u-nombre" type="text" maxLength={80} required value={f.nombre} onChange={cambiar('nombre')} />
          </div>
          <div className="campo">
            <label htmlFor="u-rol">Rol</label>
            <select id="u-rol" required value={f.rol} onChange={cambiar('rol')}>
              <option value="cocina">Cocina</option>
              <option value="caja">Caja</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="u-correo">Correo</label>
            <input id="u-correo" type="email" required value={f.correo} onChange={cambiar('correo')} />
          </div>
          <div className="campo">
            <label htmlFor="u-clave">Contraseña</label>
            <input id="u-clave" type="password" minLength={8} autoComplete="new-password" required value={f.clave} onChange={cambiar('clave')} />
            <small>Mínimo 8 caracteres.</small>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={enviando}>
            {enviando ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>
      </div>
    </>
  );
}
