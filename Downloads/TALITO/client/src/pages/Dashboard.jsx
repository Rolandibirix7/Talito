import { useEffect, useMemo, useState } from 'react';
import { api, dinero } from '../api.js';
import Grafica from '../components/Grafica.jsx';

const formatoUsd = (v) => dinero(v);

function variacion(v) {
  if (v === null) return 'Sin periodo anterior para comparar';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)} % vs. los 30 días previos`;
}

export default function Dashboard() {
  const [m, setM] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/admin/metricas').then(setM).catch((e) => setError(e.message));
  }, []);

  const meses = useMemo(() => m?.meses.map((x) => x.etiqueta) ?? [], [m]);
  const ingresos = useMemo(() => m?.meses.map((x) => x.ingresos) ?? [], [m]);
  const topNombres = useMemo(() => m?.top.map((x) => x.nombre) ?? [], [m]);
  const topCant = useMemo(() => m?.top.map((x) => x.total) ?? [], [m]);

  if (error) return <div className="error-msg" role="alert">{error}</div>;
  if (!m) return <p className="cargando">Cargando métricas…</p>;

  const k = m.kpis;
  return (
    <>
      <div className="ad-cab">
        <div>
          <h1>Métricas de ventas</h1>
        </div>
      </div>

      <section className="kpis" aria-label="Indicadores de los últimos 30 días">
        <div className="kpi"><small>Ingresos (últimos 30 días)</small><strong>{dinero(k.ingresos)}</strong><span>{variacion(k.varIngresos)}</span></div>
        <div className="kpi"><small>Pedidos cobrados (30 días)</small><strong>{k.pedidos.toLocaleString('es-SV')}</strong><span>{variacion(k.varPedidos)}</span></div>
        <div className="kpi"><small>Platillo más pedido (30 días)</small><strong>{k.estrella}</strong><span>{k.estrellaCant} unidades vendidas</span></div>
      </section>

      <section className="graficos">
        <div className="panel">
          <h2>Ingresos mensuales</h2>
          <Grafica etiquetas={meses} valores={ingresos} color="#b83a26" formato={formatoUsd}
                   descripcion="Gráfico de barras de los ingresos de los últimos seis meses" />
        </div>
        <div className="panel">
          <h2>Platillos más vendidos (30 días)</h2>
          {topNombres.length === 0 ? (
            <p className="vacio">Aún no hay ventas cobradas.</p>
          ) : (
            <Grafica etiquetas={topNombres} valores={topCant} color="#2f6b4f" horizontal
                     descripcion="Gráfico de barras de los platillos más vendidos" />
          )}
        </div>
      </section>
    </>
  );
}
