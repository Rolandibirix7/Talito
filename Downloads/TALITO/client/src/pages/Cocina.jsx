import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, hora } from '../api.js';
import { useAuth } from '../auth.jsx';
import Marca from '../components/Marca.jsx';
import { usePolling, useToast } from '../hooks.js';

const plural = (n) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`;

function Renglones({ items }) {
  return (
    <ul>
      {items.map((it) => (
        <li key={it.id}>
          <b>{it.cant}×</b>
          <div className="li-cuerpo">
            <span>{it.nombre}</span>
            {it.nota && <strong className="nota-mod"><span aria-hidden="true">⚠ </span>{it.nota}</strong>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Ticket({ p, onAvanzar, ocupado }) {
  const preparando = p.estado === 'preparando';
  const conNota = p.items.some((it) => it.nota);
  return (
    <article className={`ticket${conNota ? ' con-nota' : ''}`}>
      <div className="ticket-cab">
        <div className="mesa-num"><small>Mesa</small>{p.mesa}</div>
        <span className={`tiempo${p.min >= 10 ? ' alerta' : ''}`}>{p.min} min</span>
      </div>
      <p className="ticket-nombre">{p.nombre} · {hora(p.creadoEn)}</p>
      <Renglones items={p.items} />
      <div className="ticket-pie">
        <button type="button" className={`btn-cocina${preparando ? ' listo' : ''}`} disabled={ocupado} onClick={() => onAvanzar(p)}>
          {preparando ? 'Marcar como lista' : 'Empezar a preparar'}
        </button>
      </div>
    </article>
  );
}

function TicketHistorial({ p, onRestaurar, ocupado }) {
  const cobrada = p.estado === 'cobrada';
  const conNota = p.items.some((it) => it.nota);
  return (
    <article className={`ticket${conNota ? ' con-nota' : ''}`}>
      <div className="ticket-cab">
        <div className="mesa-num"><small>Mesa</small>{p.mesa}</div>
        <span className="tiempo">lista a las {hora(p.listoEn)}</span>
      </div>
      <p className="ticket-nombre">{p.nombre} · pedida a las {hora(p.creadoEn)}</p>
      <Renglones items={p.items} />
      <div className="ticket-pie">
        {cobrada ? (
          <p className="hist-cobrada">Ya cobrada en caja · no se puede restaurar</p>
        ) : (
          <button type="button" className="btn-cocina deshacer" disabled={ocupado} onClick={() => onRestaurar(p)}>
            Deshacer · volver a preparación
          </button>
        )}
      </div>
    </article>
  );
}

export default function Cocina() {
  const [vista, setVista] = useState('ordenes'); 
  const [pedidos, setPedidos] = useState(null);
  const [historial, setHistorial] = useState(null);
  const [sinRed, setSinRed] = useState(false);
  const [ocupado, setOcupado] = useState(0); 
  const { usuario, salir } = useAuth();
  const { toast, aviso } = useToast();
  const verHistorial = vista === 'historial';

  const cargar = useCallback(async () => {
    try {
      if (verHistorial) setHistorial(await api('/cocina/historial'));
      else setPedidos(await api('/cocina/pedidos'));
      setSinRed(false);
    } catch (e) {
      if (e.status !== 401) setSinRed(true);
    }
  }, [verHistorial]);
  usePolling(cargar, 5000);
  useEffect(() => { cargar(); }, [cargar]); 

  async function cambiarEstado(p, estado, mensaje) {
    setOcupado(p.id);
    try {
      await api(`/pedidos/${p.id}/estado`, { method: 'PATCH', body: { estado } });
      if (mensaje) aviso(mensaje);
    } catch (e) {
      aviso(e.message);
    } finally {
      setOcupado(0);
      cargar();
    }
  }

  const avanzar = (p) => cambiarEstado(p, p.estado === 'nueva' ? 'preparando' : 'lista');
  const restaurar = (p) => cambiarEstado(p, 'preparando', `Mesa ${p.mesa} volvió a «En preparación».`);

  const nuevas = pedidos?.filter((p) => p.estado === 'nueva') ?? [];
  const preparando = pedidos?.filter((p) => p.estado === 'preparando') ?? [];

  return (
    <div className="cocina">
      <header className="co-top">
        <Marca />
        <nav className="enlaces-barra" aria-label="Secciones">
          <span className="estado">Cocina · {usuario?.nombre}</span>
          <button type="button" className="btn btn-sm btn-ghost" aria-pressed={verHistorial} onClick={() => setVista(verHistorial ? 'ordenes' : 'historial')}>
            {verHistorial ? '← Volver a órdenes' : 'Historial'}
          </button>
          {usuario?.rol === 'admin' && (
            <>
              <Link className="btn btn-sm btn-ghost" to="/caja">Caja</Link>
              <Link className="btn btn-sm btn-ghost" to="/admin">Administración</Link>
            </>
          )}
          <Link className="btn btn-sm btn-ghost" to="/menu">Menú</Link>
          <button type="button" className="btn btn-sm btn-ghost" onClick={salir}>Salir</button>
        </nav>
      </header>

      {sinRed && <p className="estado-red" role="alert">Sin conexión con el servidor. Reintentando…</p>}

      {!verHistorial && (
        <main className="co-main">
          {pedidos === null && <p className="cargando">Cargando órdenes…</p>}

          <section className="co-col">
            <h2>Nuevas <small>{plural(nuevas.length)}</small></h2>
            <div className="tablero">
              {nuevas.map((p) => <Ticket key={p.id} p={p} onAvanzar={avanzar} ocupado={ocupado === p.id} />)}
            </div>
          </section>

          <section className="co-col">
            <h2>En preparación <small>{plural(preparando.length)}</small></h2>
            <div className="tablero">
              {preparando.map((p) => <Ticket key={p.id} p={p} onAvanzar={avanzar} ocupado={ocupado === p.id} />)}
            </div>
          </section>
        </main>
      )}

      {verHistorial && (
        <main className="co-main">
          <section className="co-col">
            <h2>Historial · últimas 24 h <small>{plural(historial?.length ?? 0)} marcadas como listas</small></h2>
            <p className="hist-ayuda">Si una orden se marcó como lista por error, pulsa «Deshacer» y vuelve a «En preparación».</p>
            {historial === null && <p className="cargando">Cargando historial…</p>}
            {historial?.length === 0 && <p className="cargando">Todavía no hay órdenes listas en las últimas 24 horas.</p>}
            <div className="tablero">
              {historial?.map((p) => <TicketHistorial key={p.id} p={p} onRestaurar={restaurar} ocupado={ocupado === p.id} />)}
            </div>
          </section>
        </main>
      )}

      {toast}
    </div>
  );
}
