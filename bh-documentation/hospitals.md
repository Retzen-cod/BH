# hospitals — Registro de hospitales y tablas

`src/hospitals/index.ts`
`src/hospitals/HNSJDDSM/index.ts` — hospital
`src/hospitals/HNSJDDSM/general.ts` — tabla "Balance hídrico" (por defecto)
`src/hospitals/HNSJDDSM/mantenimiento.ts` — tabla "BH + mantenimiento": copia independiente de general + mantenimiento Holliday-Segar por bloque + SC Mosteller con talla

Ver también: [[index]], [[types]], [[storage]], [[patient-screen]], [[patient-list]], [[templates]]

---

## Hospital → tablas

Un hospital solo tiene identidad (`id`, `name`, `abbreviation`) y una lista de **tablas**.
La tabla (`TableConfig`) es la unidad independiente: columnas, grupos, balance, formulario
de paciente y tamaño de la tarjeta se declaran en ella. Cambiar una tabla nunca afecta a
otra, aunque sean del mismo hospital. Se prefiere duplicar código entre tablas antes que
compartir lógica que las acople.

Cada paciente guarda `hospitalId` + `tableId`. Si falta `tableId` (pacientes antiguos) se
usa la primera tabla del hospital (`findTable`).

---

## Registro estático

```
STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,     // hospital integrado por defecto
  // agregar aquí nuevos hospitales integrados
}
```

Hospitales integrados viven en `src/hospitals/NOMBRE/` (un archivo por tabla + `index.ts`).
Hospitales y tablas custom viven en AsyncStorage. Ver [[storage]].

---

## API

```
getAllHospitals() → HospitalConfig[]            // solo integrados
isBuiltInTable(hospitalId, tableId) → boolean   // tabla definida en código
findTable(hospital, tableId?) → TableConfig     // tableId desconocido/ausente → tables[0]

getAllHospitalsAsync() → Promise<HospitalConfig[]>:
  customs ← storage.getCustomHospitals()        // ya normalizados (ver [[storage]])
  integrados: si existe un custom con el mismo id, se le añaden sus tablas extra
  + customs cuyo id no es integrado

getHospitalAsync(id?) → Promise<HospitalConfig>:
  getAllHospitalsAsync().find(id) ?? HNSJDDSM
```

---

## Anatomía

```
HospitalConfig:
  id:           'HNSJDDSM'          // no cambiar en producción
  name:         'Hospital Nacional …'
  abbreviation: 'HNSJDDSM'
  tables:       [GENERAL, …]        // la primera es la tabla por defecto

TableConfig:
  id:   'general'                   // único dentro del hospital — no cambiar en producción
  name: 'Balance hídrico'

  groups: [
    { key: 'sv',  label: 'Signos vitales', bg, textColor, cellBg }
    { key: 'ing', label: 'Ingresos',       bg, textColor, cellBg }
    { key: 'egr', label: 'Egresos',        bg, textColor, cellBg }
  ]

  balance: { ingresosGroup: 'ing', egresosGroup: 'egr', orinaKey: 'orina' }
  sc:      [ { maxPeso: 10, formula: 'pediatrica', etiqueta: 'Pediátrico' }, { formula: 'adulto' } ]
  cardPreview: ['registro', 'edad', 'peso', 'sc']
  card:        { minHeight: 104, metricsWidth: 112, metaLines: 1 }

  dataCols: [
    { key: 'ta',    label: 'T/A',  width: 72, isTA: true,     group: 'sv'  }
    { key: 'pam',   label: 'PAM',  width: 48, readOnly: true, group: 'sv'  }
    { key: 'orina', label: 'Orina',width: 54,                 group: 'egr' }
    // ColDef con alternates:
    { key: 'sedantes', ..., alternates: [ { key: 'ketamina', ... }, ... ] }
  ]

  patientFields: { nombre: 'required', edad: 'optional', registro: 'required', talla: 'hidden' }
```

---

## Cómo agregar una tabla a un hospital integrado

```
1. Crear src/hospitals/HNSJDDSM/MI_TABLA.ts
   export const MI_TABLA: TableConfig = { id: 'mi_tabla', name: '…', … }

2. Añadirla a `tables` en src/hospitals/HNSJDDSM/index.ts
   (no la pongas primera: la primera es la que usan los pacientes sin tableId)
```

## Cómo agregar un hospital nuevo

```
1. Crear src/hospitals/MI_HOSPITAL/ con un archivo por tabla y un index.ts:
   export const MI_HOSPITAL: HospitalConfig = { id, name, abbreviation, tables: [ … ] }

2. Registrar en src/hospitals/index.ts:
   import { MI_HOSPITAL } from './MI_HOSPITAL'
   STATIC['MI_HOSPITAL'] = MI_HOSPITAL

3. Si necesita campos nuevos en TableRow: añadir a src/types/index.ts

4. Si una tabla necesita layout propio: componente y switch por
   hospitalId + tableId en app/patient/[id].tsx. Ver [[patient-screen]]
```

---

## Superficie corporal por tabla

`TableConfig.sc` declara tramos por peso con una fórmula por nombre ('adulto' | 'pediatrica')
y una etiqueta opcional. Como son datos (no funciones), viajan en el `.bhd` y el receptor
calcula igual. Para una fórmula nueva: añadirla a `ScFormula` y a `SC_FORMULAS`. Ver [[calculations]].
