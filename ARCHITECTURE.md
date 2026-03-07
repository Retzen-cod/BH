# Arquitectura — Balance Hídrico

## Principios de diseño

- **Sin servidor** — Google Drive es el backend, WhatsApp es el sync, el teléfono es la base de datos
- **Sin cuentas** — el médico abre la app y funciona, sin registro, sin login
- **Sin internet obligatorio** — todo funciona offline, la conexión solo es necesaria para compartir
- **Distribución directa** — APK por WhatsApp, sin pasar por stores

## Estructura de carpetas

```
app/
  _layout.tsx          # Configuración de navegación (Expo Router)
  index.tsx            # Pantalla principal — lista de pacientes
  patient/
    [id].tsx           # Pantalla de tabla — registro hora a hora
  templates.tsx        # Editor de plantillas (solo dev, oculto en producción)

src/
  types/
    index.ts           # TableRow, BlockSummary, Patient
    hospital.ts        # HospitalConfig, ColDef, GroupDef, PatientFieldsDef

  hospitals/
    HNSJDDSM.ts        # Config del Hospital Nacional San Juan de Dios SM
    index.ts           # Registry de hospitales (built-in + custom)

  utils/
    calculations.ts    # Fórmulas puras — calcPAM, calcSC, calcBlocks, etc.
    storage.ts         # CRUD de pacientes sobre AsyncStorage
    hospitalStorage.ts # CRUD de hospitales custom sobre AsyncStorage
    settings.ts        # Preferencias de usuario (timeFormat, hospitalId)

  components/
    PatientTable.tsx          # Tabla completa de un paciente — gestos, selección, overlays
    TableCell.tsx             # Celda editable — abre teclado, triple tap, long press
    NumericSlashKeyboard.tsx  # Teclado numérico con soporte para "/" (T/A)

  gestures/
    tableGestures.ts   # Tipos TableGestureDef, TableGestureContext + registro global
    defaultGestures.ts # Swipe ↔ undo/redo — se registran como side-effect
```

## Flujo de datos

```
Usuario toca una celda
  → TableCell abre NumericSlashKeyboard
  → onCommit(val) → updateCell(rowIndex, colKey, raw)
  → copia inmutable de rows
  → setPatient(updated)          ← UI actualiza al instante
  → persist(updated)             ← debounce 600ms → savePatient()
                                 ← AsyncStorage.setItem()
```

El estado vive en React, la persistencia es eventual con debounce. Si la app se cierra en los 600ms del debounce se pierde la última celda editada — tradeoff aceptable para la fluidez de la UI.

## Cálculos

Todas las fórmulas están en `src/utils/calculations.ts` como funciones puras sin side effects.

```
calcPAM(ta)         → (S + 2D) / 3
calcSC(peso)        → (peso × 4 + 7) / (peso + 90)       — fórmula de Mosteller simplificada
calcBlocks(rows)    → bloques de 4h con PI, E, S, BH, DH
calcBHTotal(blocks) → Σ BH con signo
calcDHTotal(blocks) → Σ DH / n bloques
```

**PI** (pérdidas insensibles) = SC × 400 / 24 × horas del bloque

**BH** (balance hídrico) = E (ingresos) − S (egresos + PI)

**DH** (diuresis horaria) = Σ orina / peso / horas del bloque  `[mL/kg/h]`

## Formato `.bhd`

Versión 2 del formato de transferencia entre dispositivos:

```typescript
{
  v: 2,
  patients: Patient[],
  hospitals: HospitalConfig[]   // config embebida para portabilidad
}
```

Compatibilidad hacia atrás: `parseBHD()` detecta el campo `v` y maneja el formato legacy (v1 era `Patient | Patient[]` sin hospitales embebidos).

## Sistema multi-hospital

`HospitalConfig` define completamente la estructura de la tabla:

- `groups` — grupos de columnas con colores
- `dataCols` — columnas con ancho, tipo y grupo al que pertenecen
- `patientFields` — qué campos del formulario de creación son hidden/optional/required
- `calcSC` — override opcional de la fórmula de superficie corporal

Los hospitales custom se guardan en AsyncStorage y se incluyen automáticamente en el `.bhd` al compartir, para que el receptor pueda importar sin tener el hospital instalado.

## Persistencia

```
AsyncStorage
  bh_patients          → Patient[]          (datos clínicos)
  bh_custom_hospitals  → HospitalConfig[]   (plantillas custom)
  bh_settings          → Settings           (preferencias)
```

Todo en el dispositivo, sin sync automático. El sync es manual vía `.bhd` por WhatsApp o Drive.

## Navegación

Expo Router con file-based routing:

```
/           → lista de pacientes
/patient/123 → tabla del paciente con id "123"
```

La pantalla de tabla hace lock a landscape con `expo-screen-orientation` y lo libera al volver.

## Sistema de selección de celdas

Flujo de interacción en `PatientTable`:

```
Long press (400ms) en TableCell
  → onLongPressCell → selRect = { anchor, cur = anchor }
  → overlay azul + handle circular aparecen (posición absoluta dentro del ScrollView)
  → todos los TableCell reciben frozen=true (taps no abren teclado)
  → action bar muestra [Limpiar] [✕]

Drag del handle (Pan sobre View de 20×20px)
  → handlePanGesture.onUpdate → selRect se extiende
  → onEnd → commitDragRef.current()
    → inferAction(srcValue, selected, rows):
        src lleno + destinos vacíos   → copy   (automático)
        src lleno + destinos llenos   → replace (automático)
        src vacío + destinos llenos   → erase  (automático)
        mixto                         → disambiguation bar
    → onBatchUpdateCells([...]) → un solo paso de undo
```

**Patrón commitDragRef:** `useEffect` (sin deps, corre cada render) reescribe `commitDragRef.current` con una closure que captura los valores actuales de `rows`, `activeCols`, etc. El gesto (`useMemo([], [])`) llama `commitDragRef.current()` al soltar — siempre tiene la closure fresca sin reconstruir el gesto.

## Roadmap técnico

- Google Drive API para autosync de turno a turno
- Generación de PDF con la hoja oficial del hospital (modelo de monetización)
- Retroalimentación háptica al activar selección
