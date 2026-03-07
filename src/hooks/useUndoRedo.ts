import { useRef, useState, useCallback } from 'react';

const MAX_HISTORY = 50;

/**
 * Historial de undo/redo para un valor de tipo T.
 *
 * Usa un ref para el historial (lectura síncrona) y solo
 * dispara un re-render cuando cambia el presente.
 * Esto permite que undo() y redo() devuelvan el nuevo valor
 * de forma síncrona, sin esperar un ciclo de render.
 */
export function useUndoRedo<T>(initial: T) {
  const history = useRef({
    past:    [] as T[],
    present: initial,
    future:  [] as T[],
  });

  const [, forceRender] = useState(0);
  const tick = useCallback(() => forceRender(n => n + 1), []);

  /** Registra un nuevo estado y borra el redo stack. */
  const push = useCallback((next: T) => {
    const h = history.current;
    h.past = [...h.past.slice(-(MAX_HISTORY - 1)), h.present];
    h.present = next;
    h.future = [];
    tick();
  }, [tick]);

  /** Retrocede un paso. Devuelve el estado anterior o null si no hay historial. */
  const undo = useCallback((): T | null => {
    const h = history.current;
    if (h.past.length === 0) return null;
    const previous = h.past[h.past.length - 1];
    h.future = [h.present, ...h.future];
    h.past   = h.past.slice(0, -1);
    h.present = previous;
    tick();
    return previous;
  }, [tick]);

  /** Avanza un paso. Devuelve el siguiente estado o null si no hay redo. */
  const redo = useCallback((): T | null => {
    const h = history.current;
    if (h.future.length === 0) return null;
    const next = h.future[0];
    h.past    = [...h.past, h.present];
    h.future  = h.future.slice(1);
    h.present = next;
    tick();
    return next;
  }, [tick]);

  /** Reinicia el historial completo con un nuevo valor base (p.ej. al cargar desde storage). */
  const reset = useCallback((value: T) => {
    history.current = { past: [], present: value, future: [] };
    tick();
  }, [tick]);

  return {
    value:    history.current.present,
    push,
    undo,
    redo,
    reset,
    canUndo:  history.current.past.length > 0,
    canRedo:  history.current.future.length > 0,
  };
}
