# patient-table — Tabla interactiva

`src/components/PatientTable.tsx`

Ver también: [[index]], [[patient-screen]], [[gestures]], [[types]], [[calculations]]

---

## Props recibidas

```
Props:
  patient, hospital, settings
  onUpdateCell(rowIndex, colKey, raw)
  onBatchUpdateCells(updates[])
  onUndo(), onRedo(), canUndo, canRedo
  onToggleBlock(blockIndex)
  onColOverride(slotKey, activeKey)
  onEditInfo(updatedPatient)
  onExport(), onBack()
```

---

## Estado interno

```
state:
  selRect: DragSelection | null   // selección activa de celdas
  disambig: 'copy'|'replace'|'erase'|'mixed' | null

refs:
  dragSelRef   ← mirror de selRect (para gestos sin stale closure)
  dragCtxRef   ← { rows, slots, activeCols } frescos cada render
  commitDragRef← fn de commit reescrita cada render
  handleStartRef← posición inicial del handle en Pan
```

## Estructura visual

```
┌─────────────────────────────────────────────────────┐
│ Header: [← Back] [Paciente info] [Export] [Undo/Redo]│
├──────┬──────────────────────────────────────────────┤
│ N°   │  ScrollView horizontal                       │
│ Hora │    encabezados de grupos + columnas          │
│ fija │    filas por hora (TableCell × columna)      │
│      │    panel de bloques BH/DH (cada 4 filas)     │
└──────┴──────────────────────────────────────────────┘
│ Barra de acción (si hay selección activa)           │
└─────────────────────────────────────────────────────┘
```

## Edición de celda individual

```
TableCell:
  onPress (si !frozen):
    si valor existe y triple-tap → borrar valor (onUpdateCell con '')
    sino → abrir NumericSlashKeyboard

  onLongPress (400ms, si !frozen):
    selRect ← { anchorRow, anchorCol, endRow, endCol }
    dragSelRef ← selRect
    // todas las celdas pasan a frozen=true
    // aparece overlay azul + handle circular en esquina inferior-derecha

NumericSlashKeyboard:
  teclado custom 0-9 + '/' + borrar
  '/' habilita formato "T/A" para presión arterial
  onCommit(raw) → onUpdateCell(rowIndex, colKey, raw)
```

## Selección por arrastre (handle)

```
handlePanGesture (Pan sobre handle 20×20 px):
  .activeOffsetX([-1,1]).activeOffsetY([-1,1])   // gana desde el primer pixel
  .runOnJS(true)

  onStart:
    handleStartRef ← posición actual del handle

  onUpdate(e):
    δx, δy ← traslación desde handleStartRef
    nuevaCol ← anchorCol + floor(δx / colWidth)
    nuevaFila← anchorRow + floor(δy / rowHeight)
    selRect  ← extender rect a (nuevaFila, nuevaCol)
    dragSelRef ← selRect

  onEnd:
    commitDragRef.current()    // ejecutar acción inferida
```

## Inferencia de acción al soltar

```
commitDrag():
  celdas_origen  ← valores en anchorRow, anchorCol
  celdas_destino ← todas las celdas en selRect excepto origen

  si origen lleno && destinos vacíos  → acción = 'copy'   (sin confirmación)
  si origen lleno && destinos llenos  → acción = 'replace' (sin confirmación)
  si origen vacío && destinos con val → acción = 'erase'   (sin confirmación)
  si mixto                            → acción = 'mixed'   → mostrar barra disambig

  ejecutarAccion(accion):
    updates ← calcular updates según acción
    onBatchUpdateCells(updates)   // un paso de undo
    selRect ← null
```

## Panel de bloques BH/DH

```
para cada bloque de 4 horas:
  si bloque está en patient.disabledBlocks → mostrar tachado/gris
  sino:
    calcBlocks(rows, peso, sc, table)   // ver [[calculations]]
    mostrar: PI, E, S, BH, DH
  onPress → onToggleBlock(blockIndex)
```

## Gestos globales (columna fija N°/Hora)

```
import '../gestures/defaultGestures'   // side-effect: registra swipe undo/redo

combinedGesture:
  Gesture.Simultaneous(
    ...TableGestureRegistry.getAll().map(def => def.create(gestureCtxRef))
  )
  aplicado sobre columna fija N°/Hora (no hace scroll horizontal)
```

Ver [[gestures]] para el sistema de registro extensible.

## Columnas intercambiables (alternates)

```
ColDef.alternates: ColDef[]
  → hold-tap sobre encabezado de columna
  → mostrar picker con opciones
  → onColOverride(slotKey, activeKey)
  → patient.colOverrides[slotKey] = activeKey
  → la tabla renderiza activeKey en lugar de slotKey
```
