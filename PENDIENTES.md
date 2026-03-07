# Estado del proyecto — bh-app

## Hecho en esta sesión

### Pantalla 1 (lista de pacientes)
- [x] Contenedor delgado `app/patient/[id].tsx` + componente `PatientTable`
- [x] UUID v4 para IDs de paciente (reemplaza `Date.now()`)
- [x] Importación `.bhd`: resolución de conflictos por ID (Sobreescribir / Mantener ambos / Conservar existente)
- [x] Retrocompatibilidad `.bhd` v1 **eliminada** — solo acepta v2
- [x] `cardPreview` configurable por hospital (campos que muestra la tarjeta)
- [x] Modal de edición de paciente desde pantalla 1
- [x] Búsqueda de pacientes por cama / nombre / registro
- [x] Multiselect: hold → barra con Todos/Ninguno + Compartir + Eliminar
- [x] `FlatList` con `flex: 1` para que el multiBar no se superponga
- [x] `SafeAreaProvider` en `_layout.tsx` → `insets.top` funciona correctamente
- [x] Color del rectángulo superior según modo claro/oscuro (`useColorScheme`)
- [x] Menú de tarjeta (hold) descartable tocando afuera (`cancelable: true`)
- [x] Hora de inicio configurable al crear y editar paciente (24h fijo, fin = inicio)
- [x] `HourSelector` en el modal de editar de pantalla 1 y pantalla 2

### Pantalla 2 (tabla del paciente)
- [x] `PatientTable` genérico — renderiza cualquier `HospitalConfig`
- [x] Sistema de gestos extensible (`TableGestureRegistry`, `defaultGestures`)
- [x] Swipe derecha/izquierda en columna N°/Hora → deshacer / rehacer
- [x] `useUndoRedo` ref-based (sincrónico, max 50 pasos)
- [x] Desactivar bloques: excluye del cálculo de BH-Total y DH-Total
  - Botón `⊘` en la fila de hora de cada bloque (toggle directo, sin confirmación)
  - Botón `↺ Activar` en el overlay de bloques desactivados
  - Long press en bloque → `confirmToggleBlock` (con Alert de confirmación)
- [x] Totales siempre visibles (sin condición de "completar todos los bloques")
- [x] `disabledBlocks` solo almacena índices — los datos del bloque se preservan
- [x] Overrides de columna persistentes en `patient.colOverrides`
- [x] `onBatchUpdateCells` — copiar/mover = un solo paso de undo
- [x] **Triple tap** → borrar celda (300ms timeout, c === 1)
- [x] **Long press → handle de selección**: overlay azul + handle circular; arrastrar extiende selección; acción inferida automáticamente
- [x] **Inferencia copy/replace/erase/ambiguous** por contenido de celdas; menú de desambiguación solo en caso mixto
- [x] Barra de interacción en flujo normal (no `position: absolute`) — no se superpone
- [x] `BH·DH·E·S` movido al encabezado de grupo; columna header solo muestra PI
- [x] Hora del bloque en su propia fila (16px) separada de las métricas
- [x] Colores de grupo restaurados en celdas de datos (sin override por fila impar)
- [x] Color de celdas `isTotal` toma el `bg` del grupo (no hardcodeado en verde)
- [x] Editar info del paciente desde pantalla 2
- [x] `setBehaviorAsync` eliminado (no compatible con edge-to-edge)

### Hospital HNSJDDSM
- [x] Columnas rediseñadas: Cristal, Coloides, Dopam, Dobut, NE, Sedantes, Medic, Insulina, V.Enteral, Hemoder, Total-I / Orina, Evacua, Otros, Total-E
- [x] Columnas intercambiables con alternates (NE↔Vasop, Sedantes↔Ketam/Fent/Remi/Midaz/Cisat, etc.)
- [x] `cardPreview: ['registro', 'edad', 'peso', 'sc']`
- [x] PI como estado global en encabezado de bloque (~X mL/4h)

---

## Pendientes

### Alta prioridad
- [x] **Override de columnas como menú desplegable** — modal centrado con checkmark, restaurar y "⊘ Limpiar columna"
- [x] **Paleta de colores más formal** — grupos SV/Ingresos/Egresos desaturados en `HNSJDDSM.ts`
- [x] **Triple tap-delete** — timeout 300ms, condición `c === 1` (evita doble tap espurio)

### Gestos / UX
- [x] **Selección por handle** — long press → overlay azul + handle circular en esquina; arrastrar handle extiende la selección; acción inferida por contenido (copy/replace/erase/ambiguous)
- [x] **Inferencia de acción por contenido** — sin menú si la acción es unívoca; menú de desambiguación solo en mixto (algunas celdas llenas, otras vacías)
- [x] **Barra de acción celda única** — [Limpiar] [✕] al seleccionar sin arrastrar
- [ ] Retroalimentación háptica al activar la selección

### Arquitectura
- [x] Gestos `dragRectGesture` y `multiTouchGesture` eliminados (~130 líneas); reemplazados por `handlePanGesture` sobre el handle View

### Futuro / Nice-to-have
- [ ] Modo oscuro completo en pantalla 2 (actualmente solo pantalla 1 adapta status bar)
- [ ] Exportar tabla como imagen o PDF
- [ ] Historial de balances por paciente (múltiples turnos)
