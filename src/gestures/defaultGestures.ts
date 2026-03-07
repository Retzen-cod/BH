/**
 * Gestos por defecto de la tabla de balance hídrico.
 * Este archivo se importa como side-effect en PatientTable para registrarlos.
 *
 * Para agregar un gesto nuevo:
 *   1. Llama a TableGestureRegistry.register({ id, description, create })
 *   2. `create` recibe un MutableRefObject<TableGestureContext> — usa ctx.current
 *      dentro del handler para acceder a patient, hospital, onUndo, onRedo, etc.
 *   3. Retorna cualquier gesto de react-native-gesture-handler (Pan, Tap, Pinch…)
 *   4. Siempre incluye .runOnJS(true) si el handler llama a funciones de React.
 *
 * Zona de gesto disponible: columna fija N°/Hora (96 px, no hace scroll horizontal).
 */

import { Gesture } from 'react-native-gesture-handler';
import { TableGestureRegistry } from './tableGestures';

// ── Deslizar en columna N°/Hora → deshacer / rehacer ─────────────────────────

TableGestureRegistry.register({
  id:          'swipe-undo-redo',
  description: 'Desliza derecha → deshacer · izquierda → rehacer (columna N°/Hora)',
  create: (ctx) =>
    Gesture.Pan()
      .activeOffsetX([-25, 25])   // activar solo si el movimiento horizontal supera 25 px
      .failOffsetY([-10, 10])     // ceder al scroll vertical si el movimiento vertical supera 10 px
      .runOnJS(true)
      .onEnd((e) => {
        if      (e.translationX >  60) ctx.current.onUndo();
        else if (e.translationX < -60) ctx.current.onRedo();
      }),
});
