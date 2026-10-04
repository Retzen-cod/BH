# storage — Persistencia local (AsyncStorage)

`src/utils/storage.ts`
`src/utils/hospitalStorage.ts`
`src/utils/settings.ts`

Ver también: [[index]], [[types]], [[hospitals]], [[patient-screen]], [[patient-list]]

---

## Claves de AsyncStorage

| Clave | Contenido |
|---|---|
| `bh_patients` | `Patient[]` |
| `bh_custom_hospitals` | `HospitalConfig[]` |
| `bh_settings` | `Settings` |

---

## storage.ts — CRUD de pacientes

```
KEY = 'bh_patients'

loadAll() → Patient[]:
  raw ← AsyncStorage.getItem(KEY)
  si !raw → []
  sino → JSON.parse(raw)

saveAll(patients):
  AsyncStorage.setItem(KEY, JSON.stringify(patients))

getPatients() → Patient[]:
  retornar loadAll()

getPatient(id) → Patient | undefined:
  all ← loadAll()
  retornar all.find(p → p.id == id)

savePatient(patient):
  all ← loadAll()
  idx ← all.findIndex(p → p.id == patient.id)
  si idx >= 0 → all[idx] = patient
  sino         → all.push(patient)
  saveAll(all)

deletePatient(id):
  all ← loadAll()
  saveAll(all.filter(p → p.id ≠ id))

importPatient(patient):
  // Reemplaza si ya existe mismo id (misma cama)
  savePatient(patient)
```

---

## hospitalStorage.ts — CRUD de hospitales custom

```
KEY = 'bh_custom_hospitals'

getCustomHospitals() → HospitalConfig[]:
  raw ← AsyncStorage.getItem(KEY)
  si !raw → []
  sino → JSON.parse(raw).map(normalizeHospital)

normalizeHospital(raw) → HospitalConfig:
  // formato antiguo: groups/dataCols/… al nivel del hospital, sin `tables`
  si raw.tables es array → raw
  sino → { id, name, abbreviation, isCustom, tables: [{ id: 'principal', name, ...resto }] }

saveCustomHospital(h):
  list ← getCustomHospitals()
  idx  ← list.findIndex(x → x.id == h.id)
  si idx >= 0 → list[idx] = h
  sino         → list.push(h)
  AsyncStorage.setItem(KEY, JSON.stringify(list))

deleteCustomHospital(id):
  list ← getCustomHospitals()
  AsyncStorage.setItem(KEY, JSON.stringify(list.filter(h → h.id ≠ id)))

saveCustomTables(hospital, tables):
  // añade/reemplaza tablas en la entrada custom del hospital (la crea si no existe).
  // Con el id de un hospital integrado, la entrada solo aporta tablas extra
  // (getAllHospitalsAsync las fusiona, ver [[hospitals]]).

deleteCustomTable(hospitalId, tableId):
  quita la tabla; si la entrada queda sin tablas, borra la entrada
```

---

## settings.ts — Preferencias de usuario

```
KEY = 'bh_settings'

Settings:
  timeFormat: '12h' | '24h'
  hospitalId: string
  tableId?:   string   // tabla elegida en el selector de la barra superior; la usa el botón "+"

DEFAULTS = { timeFormat: '24h', hospitalId: 'HNSJDDSM' }

getSettings() → Settings:
  raw ← AsyncStorage.getItem(KEY)
  si !raw → { ...DEFAULTS }
  sino → { ...DEFAULTS, ...JSON.parse(raw) }   // merge con defaults

saveSettings(partial) → Settings:
  current ← getSettings()
  updated ← { ...current, ...partial }
  AsyncStorage.setItem(KEY, JSON.stringify(updated))
  retornar updated
```

---

## Helpers de formato (settings.ts)

```
formatHora(hora, format):
  si format == '24h' → hora   // "14:00"
  sino:
    h ← parseInt(hora)
    suffix ← h >= 12 ? 'PM' : 'AM'
    h12 ← h % 12 || 12
    retornar "${h12}:00 ${suffix}"

formatDate(iso):
  d ← new Date(iso)
  retornar "DD/MM/YYYY"
```
