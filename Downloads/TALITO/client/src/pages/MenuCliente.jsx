import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, dinero, guardarLocal, leerLocal } from '../api.js';
import Dialogo from '../components/Dialogo.jsx';
import Marca from '../components/Marca.jsx';
import { useToast } from '../hooks.js';

export default function MenuCliente() {
  const [menu, setMenu] = useState(null);
  const [fallo, setFallo] = useState(false);
  const [carrito, setCarrito] = useState(() => leerLocal('talito-carrito', {}, 'sessionStorage'));
  const [dlgPedido, setDlgPedido] = useState(false);
  const [dlgMesero, setDlgMesero] = useState(false);
  const [nombre, setNombre] = useState(() => leerLocal('talito-nombre', ''));
  const [mesa, setMesa] = useState(() => leerLocal('talito-mesa', ''));
  const [enviando, setEnviando] = useState(false);
  const { toast, aviso } = useToast();

  const cargar = useCallback(() => {
    setFallo(false);
    api('/menu').then(setMenu).catch(() => setFallo(true));
  }, []);
  useEffect(cargar, [cargar]);

  useEffect(() => guardarLocal('talito-carrito', carrito, 'sessionStorage'), [carrito]);

  const lineas = useMemo(() => Object.values(carrito), [carrito]);
  const unidades = lineas.reduce((s, l) => s + l.cant, 0);
  const total = lineas.reduce((s, l) => s + l.cant * l.precio, 0);

  function agregar(it) {
    setCarrito((c) => ({ ...c, [it.id]: { ...it, nota: c[it.id]?.nota ?? '', cant: Math.min(50, (c[it.id]?.cant ?? 0) + 1) } }));
  }

  function cambiarNota(id, nota) {
    setCarrito((c) => (c[id] ? { ...c, [id]: { ...c[id], nota } } : c));
  }

  function cambiar(id, delta) {
    setCarrito((c) => {
      const l = c[id];
      if (!l) return c;
      const cant = l.cant + delta;
      if (cant <= 0) {
        const { [id]: _quitado, ...resto } = c;
        return resto;
      }
      return { ...c, [id]: { ...l, cant: Math.min(50, cant) } };
    });
  }

  async function enviarPedido(e) {
    e.preventDefault();
    if (unidades === 0 || enviando) return;
    setEnviando(true);
    try {
      await api('/pedidos', {
        method: 'POST',
        body: { nombre: nombre.trim(), mesa: Number(mesa), items: lineas.map((l) => ({ id: l.id, cant: l.cant, nota: (l.nota ?? '').trim() })) },
      });
      guardarLocal('talito-nombre', nombre.trim());
      guardarLocal('talito-mesa', mesa);
      setCarrito({});
      setDlgPedido(false);
      aviso(`Pedido enviado a cocina. ¡Gracias, ${nombre.trim()}!`);
    } catch (err) {
      aviso(err.message);
      if (err.status === 422) cargar(); // quizá un platillo dejó de estar disponible: refresca el menú
    } finally {
      setEnviando(false);
    }
  }

  async function llamarMesero(e) {
    e.preventDefault();
    try {
      await api('/llamadas', { method: 'POST', body: { mesa: Number(mesa) } });
      guardarLocal('talito-mesa', mesa);
      setDlgMesero(false);
      aviso(`Avisamos al mesero de la mesa ${mesa}.`);
    } catch (err) {
      aviso(err.message);
    }
  }

  return (
    <div className="cliente">
      <header className="cl-header">
        <Marca />
      </header>

      <main className="cl-main">
        <section className="intro">
          <h1>¿Qué se te antoja hoy?</h1>
          <p>Elige tus platillos, pon tu nombre y tu número de mesa, y lo llevaremos directo a tu mesa.</p>
        </section>

        {menu === null && !fallo && (
          <p className="cargando">
            Cargando el menú…
            <small>Espera un momento...</small>
          </p>
        )}

        {fallo && (
          <p className="cargando">
            No pudimos cargar el menú. <button type="button" className="btn btn-sm btn-ghost" onClick={cargar}>Reintentar</button>
          </p>
        )}

        {menu?.length === 0 && <p className="vacio">El menú aún no tiene platillos disponibles.</p>}

        {menu && menu.length > 0 && (
          <nav className="cats" aria-label="Categorías del menú">
            {menu.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`}>{c.nombre}</a>
            ))}
          </nav>
        )}

        {menu?.map((c) => (
          <section className="categoria" id={`cat-${c.id}`} key={c.id}>
            <h2>{c.nombre}</h2>
            <ul className="platos">
              {c.items.map((it) => (
                <li className="plato" key={it.id}>
                  <div className="plato-foto">
                    {it.foto
                      ? <img src={it.foto} alt={it.nombre} loading="lazy" decoding="async" />
                      : <span className="sin-foto" aria-hidden="true">{it.nombre.charAt(0)}</span>}
                    {carrito[it.id] && <span className="plato-cant" aria-label={`${carrito[it.id].cant} en tu pedido`}>{carrito[it.id].cant}</span>}
                  </div>
                  <div className="plato-cuerpo">
                    <h3>{it.nombre}</h3>
                    <p>{it.desc}</p>
                    <div className="plato-der">
                      <span className="precio">{dinero(it.precio)}</span>
                      <button type="button" className="btn-add" onClick={() => agregar(it)} aria-label={`Agregar ${it.nombre}`}>
                        +
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <div className="barra">
        <button type="button" className="btn btn-ghost" onClick={() => setDlgMesero(true)}>
          Llamar al mesero
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setDlgPedido(true)}>
          <span>Ver pedido</span>
          <span>{unidades ? `${unidades} · ` : ''}{dinero(total)}</span>
        </button>
      </div>

      <Dialogo abierto={dlgPedido} onCerrar={() => setDlgPedido(false)} titulo="Tu pedido">
        <form onSubmit={enviarPedido}>
          {lineas.length === 0 ? (
            <p className="vacio">Todavía no has agregado nada.</p>
          ) : (
            <ul className="lista-pedido">
              {lineas.map((l) => (
                <li key={l.id}>
                  <span className="nom">{l.nombre}</span>
                  <div className="cantidad">
                    <button type="button" onClick={() => cambiar(l.id, -1)} aria-label={`Quitar uno de ${l.nombre}`}>−</button>
                    <span>{l.cant}</span>
                    <button type="button" onClick={() => cambiar(l.id, 1)} aria-label={`Agregar uno más de ${l.nombre}`}>+</button>
                  </div>
                  <span className="precio">{dinero(l.cant * l.precio)}</span>
                  <input
                    type="text"
                    className="nota-linea"
                    maxLength={120}
                    placeholder="Indicaciones: sin cebolla, salsa aparte, extra queso…"
                    aria-label={`Indicaciones para ${l.nombre}`}
                    value={l.nota ?? ''}
                    onChange={(e) => cambiarNota(l.id, e.target.value)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="total-linea"><span>Total</span><span>{dinero(total)}</span></div>

          <div className="fila-2">
            <div className="campo">
              <label htmlFor="nombre">Nombre de la orden</label>
              <input id="nombre" type="text" maxLength={40} autoComplete="given-name" required
                     value={nombre} onChange={(e) => setNombre(e.target.value)} />
            </div>
            <div className="campo">
              <label htmlFor="mesa">N.º de mesa</label>
              <input id="mesa" type="number" min={1} max={99} inputMode="numeric" required
                     value={mesa} onChange={(e) => setMesa(e.target.value)} />
            </div>
          </div>

          <div className="dlg-acciones">
            <button type="button" className="btn btn-ghost" onClick={() => setDlgPedido(false)}>Seguir viendo</button>
            <button type="submit" className="btn btn-primary" disabled={unidades === 0 || enviando}>
              {enviando ? 'Enviando…' : 'Enviar a cocina'}
            </button>
          </div>
        </form>
      </Dialogo>

      <Dialogo abierto={dlgMesero} onCerrar={() => setDlgMesero(false)} titulo="Llamar al mesero">
        <form onSubmit={llamarMesero}>
          <div className="campo">
            <label htmlFor="mesa-llamada">¿En qué mesa estás?</label>
            <input id="mesa-llamada" type="number" min={1} max={99} inputMode="numeric" required
                   value={mesa} onChange={(e) => setMesa(e.target.value)} />
            <small>Avisaremos al personal</small>
          </div>
          <div className="dlg-acciones">
            <button type="button" className="btn btn-ghost" onClick={() => setDlgMesero(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary">Avisar</button>
          </div>
        </form>
      </Dialogo>

      {toast}
    </div>
  );
}
