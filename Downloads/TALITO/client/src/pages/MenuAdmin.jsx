import { useCallback, useEffect, useState } from 'react';
import { api, dinero, reducirImagen } from '../api.js';
import Dialogo from '../components/Dialogo.jsx';

const VACIO = { id: null, nombre: '', categoriaId: '', precio: '', desc: '', disponible: true, foto: null };

function FormCategoria({ onCreada, onCancelar }) {
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api('/admin/categorias', { method: 'POST', body: { nombre } });
      onCreada(`Categoría «${nombre.trim()}» creada.`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="campo">
        <label htmlFor="c-nombre">Nombre de la categoría</label>
        <input id="c-nombre" type="text" maxLength={60} required autoFocus placeholder="Ej. Desayunos" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        <small>Aparecerá en el menú del cliente en cuanto tenga al menos un platillo disponible.</small>
      </div>
      <div className="dlg-acciones">
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Creando…' : 'Crear categoría'}</button>
      </div>
    </form>
  );
}

function FormPlatillo({ inicial, categorias, onGuardado, onEliminado, onCancelar }) {
  const [f, setF] = useState({ ...inicial, categoriaId: inicial.categoriaId || categorias[0]?.id || '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [fotoNueva, setFotoNueva] = useState(null); // data URL reducida, aún sin subir
  const [quitarFoto, setQuitarFoto] = useState(false);
  const [confirmando, setConfirmando] = useState(false); // paso de confirmación para eliminar
  const vista = fotoNueva ?? (quitarFoto ? null : inicial.foto);
  const cambiar = (campo) => (e) => setF((x) => ({ ...x, [campo]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function elegirFoto(e) {
    const archivo = e.target.files?.[0];
    e.target.value = '';
    if (!archivo) return;
    try {
      setFotoNueva(await reducirImagen(archivo));
      setQuitarFoto(false);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function eliminar() {
    setError('');
    setEnviando(true);
    try {
      await api(`/admin/platillos/${f.id}`, { method: 'DELETE' });
      onEliminado(`«${inicial.nombre}» se eliminó del menú.`);
    } catch (err) {
      setError(err.message);
      setEnviando(false);
      setConfirmando(false);
    }
  }

  async function enviar(e) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    const body = { nombre: f.nombre, categoriaId: Number(f.categoriaId), precio: f.precio, desc: f.desc, disponible: f.disponible };
    try {
      let id = f.id;
      if (id) await api(`/admin/platillos/${id}`, { method: 'PUT', body });
      else id = (await api('/admin/platillos', { method: 'POST', body })).id;

      try {
        if (fotoNueva) await api(`/admin/platillos/${id}/foto`, { method: 'PUT', body: { imagen: fotoNueva } });
        else if (quitarFoto && inicial.foto) await api(`/admin/platillos/${id}/foto`, { method: 'DELETE' });
      } catch (errFoto) {
        // El platillo ya quedó guardado: solo avisamos que la foto falló.
        onGuardado(`Platillo guardado, pero la foto no se pudo subir: ${errFoto.message}`);
        return;
      }
      onGuardado(f.id ? 'Platillo actualizado.' : 'Platillo creado.');
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar}>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="campo">
        <span className="etiqueta">Foto del platillo</span>
        <div className="foto-edit">
          <div className="foto-prev">
            {vista ? <img src={vista} alt="Vista previa de la foto" /> : <span className="sin-foto" aria-hidden="true">{(f.nombre || '?').charAt(0)}</span>}
          </div>
          <div className="foto-acciones">
            <label className="btn btn-sm btn-ghost foto-subir">
              {vista ? 'Cambiar foto' : 'Subir foto'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} />
            </label>
            {vista && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setFotoNueva(null); setQuitarFoto(true); }}>Quitar foto</button>
            )}
            <small>JPG, PNG o WebP. Se reduce automáticamente.</small>
          </div>
        </div>
      </div>
      <div className="campo">
        <label htmlFor="p-nombre">Nombre</label>
        <input id="p-nombre" type="text" maxLength={100} required value={f.nombre} onChange={cambiar('nombre')} />
      </div>
      <div className="fila-2">
        <div className="campo">
          <label htmlFor="p-cat">Categoría</label>
          <select id="p-cat" required value={f.categoriaId} onChange={cambiar('categoriaId')}>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="p-precio">Precio (USD)</label>
          <input id="p-precio" type="number" step="0.01" min={0} max={999} required value={f.precio} onChange={cambiar('precio')} />
        </div>
      </div>
      <div className="campo">
        <label htmlFor="p-desc">Descripción</label>
        <textarea id="p-desc" rows={3} maxLength={255} value={f.desc} onChange={cambiar('desc')} />
      </div>
      <label className="check">
        <input type="checkbox" checked={f.disponible} onChange={cambiar('disponible')} /> Disponible para pedir
      </label>
      {f.id && (
        <div className="zona-eliminar">
          {!confirmando ? (
            <button type="button" className="btn btn-sm btn-peligro" disabled={enviando} onClick={() => setConfirmando(true)}>Eliminar platillo</button>
          ) : (
            <>
              <p>¿Eliminar «{inicial.nombre}» del menú? No se puede deshacer. Si solo se acabó por hoy, mejor desmarca «Disponible para pedir».</p>
              <div className="dlg-acciones">
                <button type="button" className="btn btn-sm btn-ghost" disabled={enviando} onClick={() => setConfirmando(false)}>No, conservar</button>
                <button type="button" className="btn btn-sm btn-peligro" disabled={enviando} onClick={eliminar}>Sí, eliminar</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="dlg-acciones">
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </form>
  );
}

export default function MenuAdmin() {
  const [platillos, setPlatillos] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [editando, setEditando] = useState(null); // null = cerrado
  const [nuevaCat, setNuevaCat] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [p, c] = await Promise.all([api('/admin/platillos'), api('/admin/categorias')]);
      setPlatillos(p);
      setCategorias(c);
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  if (error) return <div className="error-msg" role="alert">{error}</div>;
  if (!platillos) return <p className="cargando">Cargando menú…</p>;

  return (
    <>
      <div className="ad-cab">
        <div>
          <h1>Menú</h1>
          <p>{platillos.length} platillos registrados.</p>
        </div>
        <div className="ad-acciones">
          <button type="button" className="btn btn-ghost" onClick={() => { setOk(''); setNuevaCat(true); }}>Nueva categoría</button>
          <button type="button" className="btn btn-primary" onClick={() => { setOk(''); setEditando(VACIO); }}>Nuevo platillo</button>
        </div>
      </div>

      {ok && <p className="badge ok msg-ok" role="status">{ok}</p>}

      <ul className="ad-platos">
        {platillos.map((p) => (
          <li key={p.id} className={`ad-plato${p.disponible ? '' : ' no-disponible'}`}>
            <div className="plato-foto">
              {p.foto
                ? <img src={p.foto} alt={p.nombre} loading="lazy" decoding="async" />
                : <span className="sin-foto" aria-hidden="true">{p.nombre.charAt(0)}</span>}
              <span className={`badge ${p.disponible ? 'ok' : 'off'} plato-estado`}>{p.disponible ? 'Disponible' : 'No disponible'}</span>
            </div>
            <div className="plato-cuerpo">
              <span className="plato-cat">{p.categoria}</span>
              <h3>{p.nombre}</h3>
              <p>{p.desc}</p>
              <div className="plato-der">
                <span className="precio">{dinero(p.precio)}</span>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setOk(''); setEditando(p); }}>Editar</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Dialogo abierto={nuevaCat} onCerrar={() => setNuevaCat(false)} titulo="Nueva categoría">
        <FormCategoria
          onCancelar={() => setNuevaCat(false)}
          onCreada={(msg) => { setNuevaCat(false); setOk(msg); cargar(); }}
        />
      </Dialogo>

      <Dialogo abierto={editando !== null} onCerrar={() => setEditando(null)} titulo={editando?.id ? 'Editar platillo' : 'Nuevo platillo'}>
        {editando && (
          <FormPlatillo
            inicial={editando}
            categorias={categorias}
            onCancelar={() => setEditando(null)}
            onGuardado={(msg) => { setEditando(null); setOk(msg); cargar(); }}
            onEliminado={(msg) => { setEditando(null); setOk(msg); cargar(); }}
          />
        )}
      </Dialogo>
    </>
  );
}
