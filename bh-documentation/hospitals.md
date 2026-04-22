# hospitals — Registro de hospitales

`src/hospitals/index.ts`
`src/hospitals/HNSJDDSM.ts`

Ver también: [[index]], [[types]], [[storage]], [[patient-screen]], [[patient-list]], [[templates]]

---

## Registro estático

```
STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,     // hospital integrado por defecto
  // agregar aquí nuevos hospitales integrados
}
```

Hospitales integrados viven en `src/hospitals/NOMBRE.ts`.
Hospitales custom viven en AsyncStorage. Ver [[storage]].

---

## Acceso síncrono (solo integrados)

```
getHospital(id?) → HospitalConfig:
  si id && STATIC[id] → STATIC[id]
  sino → HNSJDDSM    // fallback al default

getAllHospitals() → HospitalConfig[]:
  retornar Object.values(STATIC)
```

---

## Acceso asíncrono (integrados + custom)

```
getHospitalAsync(id?) → Promise<HospitalConfig>:
  si !id → HNSJDDSM
  si STATIC[id] → STATIC[id]
  customs ← storage.getCustomHospitals()
  retornar customs.find(h → h.id == id) ?? HNSJDDSM

getAllHospitalsAsync() → Promise<HospitalConfig[]>:
  customs ← storage.getCustomHospitals()
  retornar [...Object.values(STATIC), ...customs]
```

---

## Anatomía de un HospitalConfig

```
HospitalConfig:
  id:           'HNSJDDSM'          // no cambiar en producción
  name:         'Hospital Nacional …'
  abbreviation: 'HNS'

  groups: [
    { key: 'sv',  label: 'Signos vitales', bg, textColor, cellBg }
    { key: 'ing', label: 'Ingresos',       bg, textColor, cellBg }
    { key: 'egr', label: 'Egresos',        bg, textColor, cellBg }
  ]

  dataCols: [
    { key: 'ta',    label: 'T/A',  width: 72, isTA: true,     group: 'sv'  }
    { key: 'pam',   label: 'PAM',  width: 48, readOnly: true, group: 'sv'  }
    { key: 'orina', label: 'Orina',width: 54,                 group: 'egr' }
    // ...
    // ColDef con alternates:
    { key: 'sedantes', ..., alternates: [
      { key: 'ketamina',    ... }
      { key: 'fentanilo',   ... }
      { key: 'midazolam',   ... }
      // ...
    ]}
  ]

  patientFields: {
    nombre:   'required'
    edad:     'optional'
    registro: 'required'
    talla:    'hidden'
  }
```

---

## Cómo agregar un hospital nuevo

```
1. Crear src/hospitals/MI_HOSPITAL.ts
   export const MI_HOSPITAL: HospitalConfig = { ... }

2. Registrar en src/hospitals/index.ts:
   import { MI_HOSPITAL } from './MI_HOSPITAL'
   STATIC['MI_HOSPITAL'] = MI_HOSPITAL

3. Si necesita campos nuevos en TableRow:
   añadir a src/types/index.ts

4. Si necesita layout propio:
   crear componente y switch en app/patient/[id].tsx
   Ver [[patient-screen]]
```

---

## Nota sobre calcSC

Si el `HospitalConfig` define `calcSC: (peso) → number`,
esa función **no se serializa** al JSON del archivo `.bhd`.
El receptor usará la fórmula estándar. Ver [[calculations]] y [[share]].
