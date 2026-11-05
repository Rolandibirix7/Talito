import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, dinero, hora } from '../api.js';
import { useAuth } from '../auth.jsx';
import Dialogo from '../components/Dialogo.jsx';
import Marca from '../components/Marca.jsx';
import { usePolling, useToast } from '../hooks.js';

const ETIQUETA = { nueva: 'Nueva', preparando: 'En preparación', lista: 'Lista para servir' };
const sumar = (items) => items.reduce((s, i) => s + i.cant * i.precio, 0);

function AgregarPlatillo({ onAgregar, onCancelar }) {
  const [menu, setMenu] = useState(null);
  const [platilloId, setPlatilloId] = useState('');
  const [cant, setCant] = useState(1);
  const [nota, setNota] = useState('');

  useEffect(() => {
    api('/menu').then((m) => {
      setMenu(m);
      setPlatilloId(String(m[0]?.items[0]?.id ?? ''));
    }).catch(() => setMenu([]));
  }, []);

  if (menu === null) return <p className="cargando">Cargando menú…</p>;
  if (menu.length === 0) return <p className="vacio">No hay platillos disponibles.</p>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); onAgregar(Number(platilloId), Number(cant), nota.trim()); }}>
      <div className="campo">
        <label htmlFor="ag-platillo">Platillo</label>
        <select id="ag-platillo" value={platilloId} onChange={(e) => setPlatilloId(e.target.value)}>
          {menu.map((c) => (
            <optgroup key={c.id} label={c.nombre}>
              {c.items.map((it) => <option key={it.id} value={it.id}>{it.nombre} · {dinero(it.precio)}</option>)}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="ag-cant">Cantidad</label>
        <input id="ag-cant" type="number" min={1} max={50} required value={cant} onChange={(e) => setCant(e.target.value)} />
      </div>
      <div className="campo">
        <label htmlFor="ag-nota">Indicaciones (opcional)</label>
        <input id="ag-nota" type="text" maxLength={120} placeholder="Ej. sin cebolla, salsa aparte" value={nota} onChange={(e) => setNota(e.target.value)} />
      </div>
      <div className="dlg-acciones">
        <button type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn btn-primary">Agregar</button>
      </div>
    </form>
  );
}

export default function Caja() {
  const [datos, setDatos] = useState({ pedidos: [], llamadas: [] });
  const [cargado, setCargado] = useState(false);
  const [sinRed, setSinRed] = useState(false);
  const [edit, setEdit] = useState({}); // pedidoId -> renglones con cambios aún sin guardar
  const [sel, setSel] = useState(null);
  const [dlgAgregar, setDlgAgregar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const { usuario, salir } = useAuth();
  const { toast, aviso } = useToast();
  const avisoRef = useRef(aviso);
  avisoRef.current = aviso;

  const cargar = useCallback(async () => {
    try {
      const d = await api('/caja');
      setDatos(d);
      setCargado(true);
      setSinRed(false);
      // Conserva solo las ediciones de pedidos que siguen abiertos
      setEdit((prev) => Object.fromEntries(d.pedidos.filter((p) => prev[p.id]).map((p) => [p.id, prev[p.id]])));
      setSel((s) => (d.pedidos.some((p) => p.id === s) ? s : (d.pedidos[0]?.id ?? null)));
    } catch (e) {
      if (e.status !== 401) setSinRed(true);
    }
  }, []);
  usePolling(cargar, 6000);

  const pedido = datos.pedidos.find((p) => p.id === sel) ?? null;
  const itemsDe = (p) => edit[p.id] ?? p.items;
  const sucio = (p) => Boolean(edit[p.id]);

  function cambiarCant(p, itemId, delta) {
    setEdit((e) => ({
      ...e,
      [p.id]: itemsDe(p).map((i) => (i.id === itemId ? { ...i, cant: Math.min(50, Math.max(1, i.cant + delta)) } : i)),
    }));
  }

  function cambiarNota(p, itemId, nota) {
    setEdit((e) => ({ ...e, [p.id]: itemsDe(p).map((i) => (i.id === itemId ? { ...i, nota } : i)) }));
  }

  function quitar(p, itemId) {
    setEdit((e) => ({ ...e, [p.id]: itemsDe(p).filter((i) => i.id !== itemId) }));
  }

  async function guardarCambios(p) {
    await api(`/pedidos/${p.id}/items`, {
      method: 'PUT',
      body: { items: itemsDe(p).map((i) => ({ id: i.id, cant: i.cant, nota: i.nota })) },
    });
    setEdit(({ [p.id]: _hecho, ...resto }) => resto);
  }

  async function ejecutar(accion) {
    setTrabajando(true);
    try {
      await accion();
    } catch (e) {
      avisoRef.current(e.message);
    } finally {
      setTrabajando(false);
      cargar();
    }
  }

  const guardar = (p) => ejecutar(async () => { await guardarCambios(p); aviso('Cambios guardados.'); });

  const cobrar = (p) => ejecutar(async () => {
    const items = itemsDe(p);
    if (items.length === 0) throw new Error('El pedido no tiene platillos.');
    const total = sumar(items);
    if (sucio(p)) await guardarCambios(p);
    await api(`/pedidos/${p.id}/cobrar`, { method: 'POST' });
    aviso(`Mesa ${p.mesa} cobrada por ${dinero(total)}.`);
  });

  const agregarPlatillo = (p, platilloId, cant, nota) => ejecutar(async () => {
    if (sucio(p)) await guardarCambios(p);
    await api(`/pedidos/${p.id}/items`, { method: 'POST', body: { platilloId, cant, nota } });
    setDlgAgregar(false);
    aviso('Platillo agregado al pedido.');
  });

  const devolverACocina = (p) => ejecutar(async () => {
    await api(`/pedidos/${p.id}/estado`, { method: 'PATCH', body: { estado: 'preparando' } });
    aviso(`Mesa ${p.mesa} regresó a cocina.`);
  });

  const atender = (l) => ejecutar(() => api(`/llamadas/${l.id}`, { method: 'PATCH' }));

  const listas = datos.pedidos.filter((p) => p.estado === 'lista');
  const enCocina = datos.pedidos.filter((p) => p.estado !== 'lista');

  const botonMesa = (p) => (
    <button type="button" key={p.id} className={`mesa-btn${p.id === sel ? ' activa' : ''}`} onClick={() => setSel(p.id)}>
      <span className="mesa-n">Mesa {p.mesa}</span>
      <span className="mesa-nombre">
        {p.nombre}
        {p.estado === 'lista' && p.minLista !== null && <small> · lista hace {p.minLista} min</small>}
      </span>
      <span className="mesa-total">{dinero(sumar(itemsDe(p)))}</span>
    </button>
  );

  return (
    <>
      <header className="ca-top">
        <Marca />
        <nav className="enlaces-barra" aria-label="Secciones">
          <span className="btn btn-sm btn-ghost" aria-current="page">Caja y recepción</span>
          {usuario?.rol === 'admin' && (
            <>
              <Link className="btn btn-sm btn-ghost" to="/cocina">Cocina</Link>
              <Link className="btn btn-sm btn-ghost" to="/admin">Administración</Link>
            </>
          )}
          <button type="button" className="btn btn-sm btn-ghost" onClick={salir}>Salir · {usuario?.nombre}</button>
        </nav>
      </header>

      {sinRed && <p className="estado-red" role="alert" style={{ padding: '10px 28px', color: 'var(--chile)', fontWeight: 700 }}>Sin conexión con el servidor. Reintentando…</p>}

      <div className="ca-layout">
        <aside className="mesas" aria-label="Pedidos activos">
          {datos.llamadas.length > 0 && (
            <>
              <h2>Mesas que llaman</h2>
              {datos.llamadas.map((l) => (
                <div className="llamada" key={l.id}>
                  <span><strong>Mesa {l.mesa}</strong> · hace {l.min} min</span>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando} onClick={() => atender(l)}>Atendida</button>
                </div>
              ))}
            </>
          )}

          <h2>Listas para servir <span className="cuenta">{listas.length}</span></h2>
          {cargado && listas.length === 0 && <p className="vacio">Ninguna por ahora.</p>}
          {listas.map((p) => botonMesa(p))}

          <h2>En cocina <span className="cuenta">{enCocina.length}</span></h2>
          {!cargado && <p className="cargando">Cargando…</p>}
          {cargado && enCocina.length === 0 && <p className="vacio">No hay pedidos en cocina.</p>}
          {enCocina.map((p) => botonMesa(p))}
        </aside>

        <section aria-live="polite">
          {pedido && (
            <article className="detalle">
              <div className="det-cab">
                <div>
                  <h2>Mesa {pedido.mesa}</h2>
                  <p>
                    A nombre de {pedido.nombre} · pedido a las {hora(pedido.creadoEn)} ·{' '}
                    <span className={`badge ${pedido.estado === 'lista' ? 'ok' : 'off'}`}>{ETIQUETA[pedido.estado]}</span>
                  </p>
                </div>
                <div className="det-acciones">
                  {pedido.estado === 'lista' && (
                    <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando} onClick={() => devolverACocina(pedido)}>
                      Devolver a cocina
                    </button>
                  )}
                  <button type="button" className="btn btn-sm btn-ghost" disabled={trabajando} onClick={() => setDlgAgregar(true)}>
                    Agregar platillo
                  </button>
                </div>
              </div>

              <div className="tabla-scroll">
                <table className="tabla">
                  <thead>
                    <tr>
                      <th>Platillo</th><th>Cantidad</th><th className="num">Precio</th><th className="num">Subtotal</th>
                      <th><span className="sr-only">Quitar</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsDe(pedido).map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.nombre}
                          <input
                            type="text"
                            className={`nota-input${it.nota ? ' con-valor' : ''}`}
                            maxLength={120}
                            placeholder="+ indicaciones (sin cebolla…)"
                            aria-label={`Indicaciones para ${it.nombre}`}
                            value={it.nota ?? ''}
                            onChange={(e) => cambiarNota(pedido, it.id, e.target.value)}
                          />
                        </td>
                        <td>
                          <div className="cantidad">
                            <button type="button" onClick={() => cambiarCant(pedido, it.id, -1)} aria-label={`Quitar uno de ${it.nombre}`}>−</button>
                            <span>{it.cant}</span>
                            <button type="button" onClick={() => cambiarCant(pedido, it.id, 1)} aria-label={`Agregar uno de ${it.nombre}`}>+</button>
                          </div>
                        </td>
                        <td className="num">{dinero(it.precio)}</td>
                        <td className="num">{dinero(it.cant * it.precio)}</td>
                        <td>
                          <button type="button" className="btn-icono" onClick={() => quitar(pedido, it.id)} aria-label={`Quitar ${it.nombre} del pedido`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                              <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
                            </svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                    {itemsDe(pedido).length === 0 && (
                      <tr><td colSpan={5} className="vacio">Sin platillos. Agrega uno para poder cobrar.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="cobro">
                <div className="cobro-total"><small>Total a cobrar</small><strong>{dinero(sumar(itemsDe(pedido)))}</strong></div>
                <div className="cobro-acciones">
                  <button type="button" className="btn btn-ghost" disabled={trabajando || !sucio(pedido)} onClick={() => guardar(pedido)}>
                    Guardar cambios
                  </button>
                  <button type="button" className="btn btn-primary" disabled={trabajando} onClick={() => cobrar(pedido)}>
                    Cobrar y cerrar mesa
                  </button>
                </div>
              </div>
            </article>
          )}
        </section>
      </div>

      <Dialogo abierto={dlgAgregar && Boolean(pedido)} onCerrar={() => setDlgAgregar(false)} titulo="Agregar platillo">
        {pedido && (
          <AgregarPlatillo
            onCancelar={() => setDlgAgregar(false)}
            onAgregar={(platilloId, cant, nota) => agregarPlatillo(pedido, platilloId, cant, nota)}
          />
        )}
      </Dialogo>

      {toast}
    </>
  );
}
