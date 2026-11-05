import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'react';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);
Chart.defaults.font.family = "'DM Sans', system-ui, sans-serif";
Chart.defaults.color = '#5e645d';

export default function Grafica({ etiquetas, valores, color, horizontal = false, descripcion, formato }) {
  const ref = useRef(null);

  useEffect(() => {
    const eje = horizontal ? 'x' : 'y';
    const grafica = new Chart(ref.current, {
      type: 'bar',
      data: { labels: etiquetas, datasets: [{ data: valores, backgroundColor: color, borderRadius: 6 }] },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (c) => (formato ? formato(c.parsed[eje]) : String(c.parsed[eje])) } },
        },
        scales: {
          [eje]: { beginAtZero: true, grid: { color: '#e8e6dd' } },
          [horizontal ? 'y' : 'x']: { grid: { display: false } },
        },
      },
    });
    return () => grafica.destroy();
  }, [etiquetas, valores, color, horizontal, formato]);

  return <canvas ref={ref} role="img" aria-label={descripcion} />;
}
