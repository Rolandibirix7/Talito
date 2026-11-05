import { useEffect, useId, useRef } from 'react';

/** Diálogo modal nativo (<dialog>): maneja foco, Esc y fondo oscuro. El contenido se monta solo al abrir. */
export default function Dialogo({ abierto, onCerrar, titulo, children }) {
  const ref = useRef(null);
  const idTitulo = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto]);

  return (
    <dialog ref={ref} onClose={onCerrar} aria-labelledby={idTitulo}>
      <div className="dlg-cuerpo">
        <h2 id={idTitulo}>{titulo}</h2>
        {abierto && children}
      </div>
    </dialog>
  );
}
