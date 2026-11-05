import { createElement, useCallback, useEffect, useRef, useState } from 'react';

/** Ejecuta `fn` ahora y luego cada `ms` milisegundos (se pausa si la pestaña está oculta). */
export function usePolling(fn, ms) {
  const ref = useRef(fn);
  ref.current = fn;

  useEffect(() => {
    ref.current();
    const id = setInterval(() => {
      if (!document.hidden) ref.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Aviso emergente: const { toast, aviso } = useToast(); ... {toast} */
export function useToast() {
  const [texto, setTexto] = useState('');
  const [visible, setVisible] = useState(false);
  const temporizador = useRef(0);

  useEffect(() => () => clearTimeout(temporizador.current), []);

  const aviso = useCallback((mensaje) => {
    setTexto(mensaje);
    setVisible(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setVisible(false), 3200);
  }, []);

  const toast = createElement(
    'div',
    { className: `toast${visible ? ' visible' : ''}`, role: 'status', 'aria-live': 'polite' },
    texto,
  );
  return { toast, aviso };
}
