# types — Modelos de datos

`src/types/index.ts`
`src/types/hospital.ts`

Ver también: [[index]], [[calculations]], [[storage]], [[hospitals]], [[patient-table]]

---

## TableRow — fila de tabla (1 por hora)

```
TableRow:
  hora: string           // "07:00" — obligatorio

  // Signos vitales
  ta?:  string           // "120/80" — texto libre con /
  pam?: number           // auto: calcPAM(ta)  → ver [[calculations]]
  fc?:  number
  fr?:  number
  so2?: number
  temp?: number
  hgt?: number

  // Ingresos (mL)
  cristaloides?, coloides?
  dopamina?, dobutamina?, norepinefrina?, vasopresina?
  sedantes?                  // bucket: agrupa ketamina/fentanilo/…
  ketamina?, fentanilo?, remifentanilo?, midazolam?, cisatracurio?
  insulina?, medicamentos?, dextrosa?
  enteral?, hemoderivados?, otrosIngresos?

  // Egresos (mL)
  orina?, evacuaciones?, aspiraciones?, otrosEgresos?
```

---

## BlockSummary — resumen de bloque de 4h (calculado, no almacenado)

```
BlockSummary:
  blockIndex: number
  startHora:  string      // "07:00"
  endHora:    string      // "10:00"
  pi: number              // SC × 400/24 × horas_bloque
  e:  number              // Σ ingresos del bloque
  s:  number              // Σ egresos + PI
  bh: number              // E − S
  dh: number              // Σ orina / peso / horas_bloque  (mL/kg/h)
```

---

## Patient — entidad principal

```
Patient:
  id:         string      // uuid
  cama:       string      // obligatorio
  nombre?:    string
  edad?:      number
  registro?:  string
  peso?:      number      // kg — para DH y PI
  talla?:     number      // cm
  sc?:        number      // auto: calcSC(peso)  → ver [[calculations]]
  startHora:  string      // "07:00"
  endHora:    string      // "07:00" (== start → 24h)
  hospitalId: string      // clave del HospitalConfig
  createdAt:  string      // ISO 8601
  rows:       TableRow[]  // una fila por hora

  // opcionales
  disabledBlocks?: number[]              // bloques excluidos de totales
  colOverrides?:   Record<string, string> // { slotKey → activeColKey }
```

---

## HospitalConfig — configuración de hospital

```
HospitalConfig:
  id:           string     // único, no cambiar en producción
  name:         string
  abbreviation: string
  groups:       GroupDef[]    // grupos de columnas (orden importa)
  dataCols:     ColDef[]      // columnas de la tabla (sin N° y Hora)
  patientFields?: PatientFieldsDef
  isCustom?:    boolean       // true si creada por el usuario
  cardPreview?: string[]      // campos mostrados en la card de lista
  calcSC?:      (peso) → number  // override de fórmula (no serializable a JSON)
```

---

## GroupDef — grupo de columnas

```
GroupDef:
  key:       string   // 'sv' | 'ing' | 'egr'
  label:     string
  bg:        string   // color encabezado
  textColor: string
  cellBg:    string   // color celdas de datos
```

---

## ColDef — columna

```
ColDef:
  key:        string        // campo de TableRow
  label:      string
  width:      number        // px
  isTA?:      boolean       // teclado con "/"
  readOnly?:  boolean       // calculada (ej. PAM)
  isTotal?:   boolean       // suma del grupo en la fila
  group:      string        // GroupDef.key
  alternates?: ColDef[]     // columnas intercambiables via hold-tap
```

---

## PatientFieldsDef — formulario de creación

```
FieldMode = 'hidden' | 'optional' | 'required'

PatientFieldsDef:
  nombre?:   FieldMode
  edad?:     FieldMode
  registro?: FieldMode
  talla?:    FieldMode

// cama y peso siempre obligatorios, no se declaran aquí
```
