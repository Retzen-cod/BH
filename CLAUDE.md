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

- `calculations.ts` — pure functions: `calcPAM`, `calcSC`, `calcBlocks`, `calcBHTotal`, `calcDHTotal`. No side effects.
- `storage.ts` — CRUD on `Patient[]` via AsyncStorage (key: `bh_patients`)
- `hospitalStorage.ts` — CRUD on custom `HospitalConfig[]` (key: `bh_custom_hospitals`)
- `settings.ts` — user preferences: `timeFormat`, `hospitalId` (key: `bh_settings`)

### Multi-hospital system (`src/hospitals/`)

`HospitalConfig` defines the entire table structure for a hospital. Built-in configs live in `src/hospitals/`. To add a new hospital:
1. Create `src/hospitals/NOMBRE.ts` implementing `HospitalConfig` from `src/types/hospital.ts`
2. Register it in `src/hospitals/index.ts`

Custom hospitals created in-app are stored in AsyncStorage and embedded in `.bhd` exports for portability.

### `.bhd` file format

Proprietary transfer format for shift handoffs — a ZIP file (so WhatsApp transmits it unchanged):

```
bh_cama_5.bhd  (zip)
├── hospitals.json   — embedded HospitalConfig[] for portability
└── cama_5.json      — Patient data
```

Current format version is v2. `parseBHD()` handles backward compatibility with v1 (plain JSON `Patient | Patient[]` without embedded hospitals).

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

## Agregar un hospital nuevo

### 1. Crear la configuración del hospital

Crear `src/hospitals/NOMBRE.ts` implementando `HospitalConfig` (ver `src/types/hospital.ts`):

```typescript
export const MI_HOSPITAL: HospitalConfig = {
  id:           'MI_HOSPITAL',       // clave única — no cambiar después de producción
  name:         'Nombre completo',
  abbreviation: 'MH',

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

  // Opcional: override de la fórmula de superficie corporal.
  // Si no se define, se usa (peso × 4 + 7) / (peso + 90).
  // calcSC: (peso) => ...,
};
```

Registrar en `src/hospitals/index.ts`:

```typescript
import { MI_HOSPITAL } from './MI_HOSPITAL';

const STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,
  MI_HOSPITAL,   // ← añadir aquí
};
```

---

### 2. Pantalla 1 — lo que el médico ve al seleccionar un paciente

La `PatientCard` en `app/index.tsx` es **genérica**: muestra cama, nombre, edad, peso, SC, horario y calcula BH/DH con `calcBlocks` sobre `patient.rows`. **No requiere cambios** al añadir un hospital.

Lo que sí controla `patientFields` es el formulario de creación (`AddPatientModal`). Los campos `cama` y `peso` son siempre obligatorios. Los demás (`nombre`, `edad`, `registro`, `talla`) respetan el `FieldMode` que declares en `patientFields`.

---

### 3. Pantalla 2 — tabla del paciente

#### Caso A: layout estándar (filas por hora + panel de bloques de 4h)

No hacer nada. `app/patient/[id].tsx` carga el hospital con `getHospitalAsync(patient.hospitalId)` y lo pasa al componente `PatientTable`, que ya renderiza cualquier `HospitalConfig` de forma genérica usando sus `groups` y `dataCols`.

#### Caso B: el hospital necesita un layout completamente diferente

1. Crear `src/components/MI_HOSPITAL_Table.tsx` con la misma firma de props que `PatientTable`:
   ```typescript
   interface Props {
     patient:      Patient;
     hospital:     HospitalConfig;
     settings:     Settings;
     onUpdateCell: (rowIndex: number, colKey: string, raw: string) => void;
     onExport:     () => void;
     onBack:       () => void;
   }
   ```

2. En `app/patient/[id].tsx`, elegir el componente según el hospital:
   ```typescript
   import MI_HOSPITAL_Table from '../../src/components/MI_HOSPITAL_Table';

   // dentro del return, reemplazar <PatientTable ... /> por:
   {patient.hospitalId === 'MI_HOSPITAL'
     ? <MI_HOSPITAL_Table {...props} />
     : <PatientTable      {...props} />
   }
   ```

El contenedor (`[id].tsx`) no cambia: sigue manejando orientación, carga de datos y debounce.

---

### 4. Sharing — no requiere ningún cambio

`sharePatients()` en `src/utils/share.ts` empaqueta automáticamente el `HospitalConfig` completo del paciente dentro del archivo `.bhd` (zip). Al importar, `importBHDData()` en `app/index.tsx` detecta si el hospital ya existe en el dispositivo del receptor y lo guarda en AsyncStorage si no. El receptor puede abrir el archivo sin tener el hospital instalado.

El único escenario que requiere atención: si el hospital custom usa `calcSC` como función, esa función **no se serializa** al JSON del zip. El receptor usará la fórmula estándar para los cálculos de PI. Si esto importa, dejar `calcSC` sin definir y usar la estándar, o documentarlo en el hospital.

---

### Checklist para un hospital nuevo

- [ ] `src/hospitals/NOMBRE.ts` con `HospitalConfig` completo
- [ ] Registrado en `src/hospitals/index.ts` dentro de `STATIC`
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
