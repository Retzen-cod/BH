# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (choose platform)
npm run start        # Expo dev server
npm run android      # Start with Android
npm run ios          # Start with iOS

# Build APK via EAS
eas build --profile preview --platform android   # Internal APK for distribution
eas build --profile development --platform android  # Dev client build
```

There are no test commands — this project has no test suite.

## Architecture

React Native app using **Expo Router** (file-based routing). The entry point is `expo-router/entry` (not `App.tsx`, which is unused).

### Navigation (`app/`)

- `_layout.tsx` — root layout wrapping everything in `ShareIntentProvider` + `GestureHandlerRootView`
- `index.tsx` — patient list screen
- `patient/[id].tsx` — hourly data table for a single patient; locks to landscape via `expo-screen-orientation`
- `templates.tsx` — hospital template editor (dev-only, hidden in production)

### Core data model (`src/types/`)

- `Patient` — holds patient metadata + `rows: TableRow[]` (one row per hour)
- `TableRow` — all clinical fields (vitals, ingresos, egresos); all optional except `hora`
- `BlockSummary` — computed (never stored), aggregates 4-hour blocks with PI, E, S, BH, DH

### Business logic (`src/utils/`)

- `calculations.ts` — pure functions: `calcPAM`, `calcSC(peso, table)` (SC by the table's weight tiers; always re-derived for calculations, stored `patient.sc` is informational), `calcBlocks`, `calcBHTotal`, `calcDHTotal`. No side effects. `calcBlocks` takes the `TableConfig`: which columns count as ingresos/egresos/orina comes from the table (`balance` + `dataCols` groups, alternates included), never from a hardcoded field list — so editing one table never changes another's balance.
- `storage.ts` — CRUD on `Patient[]` via AsyncStorage (key: `bh_patients`)
- `hospitalStorage.ts` — CRUD on custom `HospitalConfig[]` (key: `bh_custom_hospitals`)
- `settings.ts` — user preferences: `timeFormat`, `hospitalId` (key: `bh_settings`)

### Multi-hospital system (`src/hospitals/`)

Hospital → tables. `HospitalConfig` is only identity (`id`, `name`, `abbreviation`) plus `tables: TableConfig[]`. The **table** is the independent unit: groups, columns, balance, patient form and card layout live in `TableConfig`, and changing one table must never affect another — even in the same hospital. Prefer duplicating code per table over shared logic that couples tables.

- Built-in: `src/hospitals/NOMBRE/` — one file per table + `index.ts` with the `HospitalConfig`; registered in `src/hospitals/index.ts`.
- `Patient` stores `hospitalId` + `tableId`. Missing `tableId` (old patients) → first table (`findTable`). Keep the default table first.
- Custom hospitals/tables live in AsyncStorage. A custom entry with a built-in hospital's id only adds extra tables (`getAllHospitalsAsync` merges them). Old single-table custom hospitals are migrated on read by `normalizeHospital` (table id `'principal'`).

### `.bhd` file format

Proprietary transfer format for shift handoffs — a ZIP file (so WhatsApp transmits it unchanged):

```
bh_cama_5.bhd  (zip)
├── hospitals.json   — embedded HospitalConfig[] with only the tables these patients use
└── cama_5.json      — Patient data
```

Current format: hospitals carry `tables`, patients carry `tableId`. v2 files (hospitals without `tables`) are still accepted: `normalizeHospital` wraps them in one table; if the hospital already exists locally nothing is added and those patients use the local first table. Import never overwrites an existing table — it only adds missing ones.

### Cell editing flow

**Single cell:** `TableCell` opens `NumericSlashKeyboard` (custom keyboard supporting "/" for blood pressure "T/A" format) → `onCommit` → immutable update of `rows` → `setPatient` (instant UI) → `savePatient` debounced 600ms → AsyncStorage. Last edit is lost if app closes within the debounce window (accepted tradeoff).

**Triple tap:** deletes the cell value immediately (no keyboard opens).

**Long press → handle selection:**
1. Long press any editable cell (400ms) → `onLongPressCell` → `selRect` set → blue overlay + circular handle appear at bottom-right corner of selection.
2. While `selRect !== null`, all cells receive `frozen={true}` → taps no longer open the keyboard.
3. Action bar appears at bottom: [Limpiar] clears anchor cell · [✕] cancels.
4. Drag the handle → selection rectangle extends right/down from anchor → `handlePanGesture` updates `selRect` each frame.
5. On handle release → `commitDragRef.current()` runs → action inferred from content:
   - Source full + all targets empty → **copy** (no confirmation)
   - Source full + all targets full → **replace** (no confirmation)
   - Source empty + targets have values → **erase** (no confirmation)
   - Mixed → disambiguation bar: [Solo vacías] [Reemplazar todo] [✕]
6. All batch updates go through `onBatchUpdateCells` → single undo step.

---

## Agregar un hospital o una tabla nueva

### 1. Crear la configuración

Cada tabla va en su propio archivo implementando `TableConfig` (ver `src/types/hospital.ts`).
Para una tabla nueva en un hospital existente basta con este archivo + añadirla a `tables` del hospital.

```typescript
// src/hospitals/MI_HOSPITAL/uci.ts
export const UCI: TableConfig = {
  id:   'uci',                       // único dentro del hospital — no cambiar después de producción
  name: 'UCI adultos',

  groups: [
    { key: 'sv',  label: 'Signos vitales', bg: '#DBEAFE', textColor: '#1D4ED8', cellBg: '#F0F9FF' },
    { key: 'ing', label: 'Ingresos',       bg: '#D1FAE5', textColor: '#065F46', cellBg: '#F0FDF4' },
    { key: 'egr', label: 'Egresos',        bg: '#FEF3C7', textColor: '#92400E', cellBg: '#FFFBEB' },
  ],

  // Controla qué campos aparecen en el modal de creación de paciente.
  // 'hidden' = no mostrar · 'optional' = mostrar sin * · 'required' = mostrar con * y validar
  // cama y peso son siempre obligatorios y no se declaran aquí.
  patientFields: {
    nombre:   'required',
    edad:     'optional',
    registro: 'required',
    talla:    'hidden',
  },

  dataCols: [
    // Cada col.key debe ser un campo de TableRow (src/types/index.ts).
    // Si el hospital necesita un campo nuevo, añadirlo a TableRow primero.
    { key: 'ta',   label: 'T/A',      width: 72, isTA: true,     group: 'sv'  },
    { key: 'pam',  label: 'PAM',      width: 48, readOnly: true, group: 'sv'  },
    { key: 'orina',label: 'Orina',    width: 54,                 group: 'egr' },
    // ...
  ],

  // Espacio de la tarjeta en pantalla 1. Lo que se omita se ajusta al contenido.
  card: { minHeight: 104, metricsWidth: 112, metaLines: 1 },

  // Qué entra al balance: todas las columnas (y alternates) de estos grupos.
  // Si se omite: 'ing' / 'egr' / 'orina'.
  balance: { ingresosGroup: 'ing', egresosGroup: 'egr', orinaKey: 'orina' },

  // Opcional: superficie corporal por tramos de peso (primer tramo con peso <= maxPeso).
  // Si se omite: 'adulto' = (peso × 4 + 7) / (peso + 90) para todo peso.
  sc: [
    { maxPeso: 10, formula: 'pediatrica', etiqueta: 'Pediátrico' }, // (peso × 4 + 9) / 100
    {              formula: 'adulto' },
  ],
};
```

```typescript
// src/hospitals/MI_HOSPITAL/index.ts
export const MI_HOSPITAL: HospitalConfig = {
  id:           'MI_HOSPITAL',       // clave única — no cambiar después de producción
  name:         'Nombre completo',
  abbreviation: 'MH',
  tables: [UCI],                     // la primera es la de por defecto
};
```

Registrar el hospital en `src/hospitals/index.ts`:

```typescript
import { MI_HOSPITAL } from './MI_HOSPITAL';

const STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,
  MI_HOSPITAL,   // ← añadir aquí
};
```

---

### 2. Pantalla 1 — lo que el médico ve al seleccionar un paciente

La `PatientCard` en `app/index.tsx` es **genérica**: muestra cama, nombre, edad, peso, SC, horario y calcula BH/DH con `calcBlocks` sobre `patient.rows`. **No requiere cambios** al añadir un hospital o tabla. Qué datos muestra lo decide `cardPreview` y cuánto espacio ocupa lo decide `card` (`minHeight`, `metricsWidth`, `metaLines`), ambos de la tabla del paciente.

Hospital y tabla se eligen juntos en el selector de la barra superior (`HospitalPickerModal`, guarda `settings.hospitalId` + `settings.tableId`); el botón "+" crea el paciente con esa tabla. `patientFields` de esa tabla controla el formulario de creación. Los campos `cama` y `peso` son siempre obligatorios. Los demás (`nombre`, `edad`, `registro`, `talla`) respetan el `FieldMode` que declares en `patientFields`.

---

### 3. Pantalla 2 — tabla del paciente

#### Caso A: layout estándar (filas por hora + panel de bloques de 4h)

No hacer nada. `app/patient/[id].tsx` carga el hospital con `getHospitalAsync(patient.hospitalId)`, resuelve la tabla con `findTable(hospital, patient.tableId)` y pasa ambos a `PatientTable`, que renderiza cualquier `TableConfig` de forma genérica usando sus `groups` y `dataCols`.

#### Caso B: la tabla necesita un layout completamente diferente

1. Crear `src/components/MI_HOSPITAL_Table.tsx` con la misma firma de props que `PatientTable`:
   ```typescript
   interface Props {
     patient:      Patient;
     hospital:     HospitalConfig;
     table:        TableConfig;
     settings:     Settings;
     onUpdateCell: (rowIndex: number, colKey: string, raw: string) => void;
     onExport:     () => void;
     onBack:       () => void;
   }
   ```

2. En `app/patient/[id].tsx`, elegir el componente según hospital + tabla:
   ```typescript
   import MI_HOSPITAL_Table from '../../src/components/MI_HOSPITAL_Table';

   // dentro del return, reemplazar <PatientTable ... /> por:
   {patient.hospitalId === 'MI_HOSPITAL' && table.id === 'uci'
     ? <MI_HOSPITAL_Table {...props} />
     : <PatientTable      {...props} />
   }
   ```

El contenedor (`[id].tsx`) no cambia: sigue manejando orientación, carga de datos y debounce.

---

### 4. Sharing — no requiere ningún cambio

`sharePatients()` en `src/utils/share.ts` empaqueta el hospital con **solo las tablas que usan los pacientes** dentro del `.bhd` (zip). Al importar, `importBHDData()` en `app/index.tsx` guarda el hospital si no existe, o añade solo las tablas que falten; nunca sobrescribe una tabla existente. El receptor puede abrir el archivo sin tener el hospital ni la tabla instalados.

Todo lo que afecta cálculos (balance, tramos de SC) se declara como datos en la tabla, así que viaja en el zip y el receptor calcula igual. No usar funciones en `TableConfig`: no se serializan.

---

### Checklist para un hospital o tabla nueva

- [ ] Un archivo `TableConfig` por tabla en `src/hospitals/NOMBRE/`, con `id` estable
- [ ] Tabla añadida a `tables` del hospital (no como primera si ya hay pacientes sin `tableId`)
- [ ] Hospital nuevo: `src/hospitals/NOMBRE/index.ts` registrado en `src/hospitals/index.ts` dentro de `STATIC`
- [ ] Si el hospital usa campos nuevos en `TableRow`: añadirlos a `src/types/index.ts`
- [ ] Si necesita layout diferente: componente en `src/components/` + switch en `app/patient/[id].tsx`
- [ ] Si `patientFields.registro` es `'required'`, verificar que el campo esté en `TableRow` o al menos en `Patient` — actualmente es solo metadata, no columna de tabla

---

---

## Sistema de gestos de tabla

Los gestos globales de la tabla se definen en `src/gestures/`. Son extensibles sin tocar `PatientTable`.

### Arquitectura

```
src/gestures/
  tableGestures.ts   — tipos (TableGestureDef, TableGestureContext) + registro global
  defaultGestures.ts — gestos incluidos por defecto (se registran como side-effect)
```

Hay dos capas de gestos en `PatientTable`:

**1. `combinedGesture` — columna fija N°/Hora**
`PatientTable` importa `defaultGestures.ts` como side-effect, lee el registro con `TableGestureRegistry.getAll()`, construye un `Gesture.Simultaneous(...)` y aplica el `GestureDetector` sobre la columna fija N°/Hora (sin scroll horizontal, sin conflictos). Actualmente contiene swipe derecha → undo / swipe izquierda → redo.

**2. `handlePanGesture` — handle de selección**
Gesto `Pan` aplicado únicamente sobre el handle circular (View de 20×20 px) que aparece en la esquina inferior-derecha del overlay de selección. Se crea con `useMemo([], [])` y lee `dragSelRef` / `dragCtxRef` (refs actualizados cada render) para no reconstruirse en cada render. `.activeOffsetX([-1,1]).activeOffsetY([-1,1])` hace que el Pan gane sobre el ScrollView horizontal desde el primer pixel.

El contexto se pasa como `MutableRefObject<TableGestureContext>` para que los handlers lean valores frescos sin re-crear el gesto en cada render:

```typescript
create: (ctx) =>
  Gesture.Pan()
    .runOnJS(true)              // obligatorio para llamar setState/callbacks de React
    .activeOffsetX([-25, 25])  // solo activar en swipes horizontales claros
    .failOffsetY([-10, 10])    // ceder al scroll vertical si se mueve verticalmente primero
    .onEnd((e) => {
      if (e.translationX > 60) ctx.current.onUndo();
    }),
```

### Agregar un gesto nuevo

```typescript
// src/gestures/miGesto.ts
import { Gesture } from 'react-native-gesture-handler';
import { TableGestureRegistry } from './tableGestures';

TableGestureRegistry.register({
  id:          'mi-gesto-unico',
  description: 'Descripción para el desarrollador',
  create: (ctx) =>
    Gesture.Tap()
      .numberOfTaps(2)
      .runOnJS(true)
      .onEnd(() => { /* ctx.current.patient, ctx.current.onUndo(), etc. */ }),
});
```

Luego importarlo como side-effect en `PatientTable.tsx`:
```typescript
import '../gestures/miGesto';
```

### TableGestureContext disponible (para gestos del registro global)

| Campo          | Tipo                                          |
|----------------|-----------------------------------------------|
| `patient`      | `Patient`                                     |
| `hospital`     | `HospitalConfig`                              |
| `onUndo`       | `() => void`                                  |
| `onRedo`       | `() => void`                                  |
| `onUpdateCell` | `(rowIndex, colKey, raw) => void`             |

### Estado interno de selección (en `PatientTable`)

| Ref/State        | Tipo                        | Descripción                                              |
|------------------|-----------------------------|----------------------------------------------------------|
| `selRect`        | `DragSelection \| null`     | Estado React — dispara re-render del overlay y barra     |
| `dragSelRef`     | `ref<DragSelection \| null>`| Mirror de selRect leído por los gestos (sin stale)       |
| `dragCtxRef`     | `ref<{rows,slots,activeCols}>`| Contexto de datos fresco para los gestos              |
| `commitDragRef`  | `ref<() => void>`           | Lógica de commit reescrita cada render (closure fresca)  |
| `handleStartRef` | `ref<{x,y}>`               | Posición del handle al iniciar el Pan                    |

---

### Share intent

`expo-share-intent` handles opening `.bhd` files directly from WhatsApp. `ShareIntentProvider` wraps the entire app in `_layout.tsx`.
