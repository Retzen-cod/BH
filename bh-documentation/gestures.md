# gestures — Sistema de gestos extensible

`src/gestures/tableGestures.ts`
`src/gestures/defaultGestures.ts`

Ver también: [[index]], [[patient-table]]

---

## Arquitectura

```
TableGestureRegistry (Map global)
  ↑ register()  (side-effect al importar el módulo)
  ↓ getAll()    (leído por PatientTable al construir combinedGesture)
```

Los gestos viven fuera de `PatientTable` → se pueden añadir sin tocarlo.

---

## TableGestureContext

```
interface TableGestureContext:
  patient:      Patient
  hospital:     HospitalConfig
  table:        TableConfig
  onUndo:       () → void
  onRedo:       () → void
  onUpdateCell: (rowIndex, colKey, raw) → void
```

Se pasa como `MutableRefObject<TableGestureContext>` para que los handlers
lean valores frescos sin re-crear el gesto en cada render.

---

## TableGestureDef

```
interface TableGestureDef:
  id:          string           // único, replace si se re-registra
  description: string           // para el desarrollador
  create:      (ctx: MutableRefObject<TableGestureContext>) → GestureType
```

---

## Registro global

```
TableGestureRegistry:
  register(def):
    registry.set(def.id, def)   // reemplaza si ya existe

  unregister(id):
    registry.delete(id)

  getAll() → TableGestureDef[]
    retorna Array.from(registry.values())
```

---

## Gesto por defecto: swipe undo/redo

`defaultGestures.ts` (importado como side-effect en [[patient-table]])

```
register({
  id: 'swipe-undo-redo',
  create: (ctx) →
    Gesture.Pan()
      .activeOffsetX([-25, 25])    // activar solo en swipes horizontales > 25 px
      .failOffsetY([-10, 10])      // ceder al scroll vertical si δy > 10 px
      .runOnJS(true)
      .onEnd(e):
        si e.translationX >  60 → ctx.current.onUndo()
        si e.translationX < -60 → ctx.current.onRedo()
})
```

Zona activa: columna fija N°/Hora (96 px, sin scroll horizontal).

---

## Cómo agregar un gesto nuevo

```
// src/gestures/miGesto.ts
import { Gesture } from 'react-native-gesture-handler'
import { TableGestureRegistry } from './tableGestures'

TableGestureRegistry.register({
  id:          'mi-gesto',
  description: '...',
  create: (ctx) →
    Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(() → { ctx.current.onUndo() })
})

// En PatientTable.tsx:
import '../gestures/miGesto'   // side-effect
```

---

## handlePanGesture (handle de selección)

Separado del registro global. Definido en [[patient-table]] con `useMemo([], [])`.

```
handlePanGesture:
  Gesture.Pan()
    .activeOffsetX([-1,1]).activeOffsetY([-1,1])  // gana desde el primer pixel
    .runOnJS(true)
    .onStart  → handleStartRef ← posición handle
    .onUpdate → actualizar selRect vía dragSelRef
    .onEnd    → commitDragRef.current()
```
