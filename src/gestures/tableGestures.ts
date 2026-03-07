import { GestureType } from 'react-native-gesture-handler';
import { MutableRefObject } from 'react';
import { Patient } from '../types';
import { HospitalConfig } from '../types/hospital';

// ─── Contexto disponible para cada gesto ─────────────────────────────────────
// Se pasa como ref para evitar closures obsoletas: lee ctx.current en el handler.

export interface TableGestureContext {
  patient:      Patient;
  hospital:     HospitalConfig;
  onUndo:       () => void;
  onRedo:       () => void;
  onUpdateCell: (rowIndex: number, colKey: string, raw: string) => void;
}

// ─── Definición de gesto ──────────────────────────────────────────────────────

export interface TableGestureDef {
  id:          string;
  description: string;
  /**
   * Devuelve un gesto de react-native-gesture-handler.
   * Recibe un ref al contexto actual — usa `ctx.current` dentro del handler
   * para acceder a los valores más recientes sin re-crear el gesto en cada render.
   *
   * Ejemplo:
   * ```ts
   * create: (ctx) =>
   *   Gesture.Pan()
   *     .runOnJS(true)
   *     .onEnd((e) => { if (e.translationX > 60) ctx.current.onUndo(); }),
   * ```
   */
  create: (ctx: MutableRefObject<TableGestureContext>) => GestureType;
}

// ─── Registro global ──────────────────────────────────────────────────────────
// Los gestos se registran al importar su módulo (side-effect).
// El componente los consume con TableGestureRegistry.getAll().

const registry = new Map<string, TableGestureDef>();

export const TableGestureRegistry = {
  /** Registra un gesto. Si ya existe un gesto con el mismo id, lo reemplaza. */
  register(def: TableGestureDef): void {
    registry.set(def.id, def);
  },

  /** Elimina un gesto del registro (útil en tests o feature flags). */
  unregister(id: string): void {
    registry.delete(id);
  },

  getAll(): TableGestureDef[] {
    return Array.from(registry.values());
  },
};
