# patient-list — Lista de pacientes

`app/index.tsx`

Ver también: [[index]], [[navigation]], [[patient-screen]], [[types]], [[storage]], [[hospitals]], [[share]], [[calculations]]

---

## Estado principal

```
patientListScreen:
  state:
    patients: Patient[]          // todos los pacientes cargados de AsyncStorage
    hospitals: HospitalConfig[]  // todos los hospitales (static + custom)
    settings: Settings
    search: string
    sortKey: 'cama' | 'nombre' | 'createdAt'
    importing: bool
```

## Ciclo de vida

```
onMount():
  patients  ← storage.getPatients()
  hospitals ← hospitals.getAllHospitalsAsync()
  settings  ← storage.getSettings()

  // share intent: si se abre desde WhatsApp con .bhd
  si shareIntent.files existe:
    importBHDData(shareIntent.files[0])
```

## Importar .bhd

```
importBHDData(uri):
  bytes ← FileSystem.readAsStringAsync(uri, base64)
  zip   ← JSZip.loadAsync(bytes)

  // compatibilidad v1 (JSON plano) vs v2 (zip)
  si zip tiene 'hospitals.json':
    hospitales ← JSON.parse(zip['hospitals.json'])
    para cada hospital:
      si no existe localmente → storage.saveCustomHospital(hospital)
    pacientes ← todos los *.json del zip excepto hospitals.json
  sino:
    // formato v1: Patient | Patient[]
    pacientes ← JSON.parse(contenido)

  para cada paciente:
    storage.importPatient(paciente)
  recargar lista
```

## Crear paciente

```
AddPatientModal(hospital):
  campos según hospital.patientFields:
    cama:     siempre obligatorio
    peso:     siempre obligatorio
    nombre:   según FieldMode
    edad:     según FieldMode
    registro: según FieldMode
    talla:    según FieldMode

  onConfirm():
    validar campos required
    sc ← calcSC(peso, tabla)   // ver [[calculations]]
    rows ← buildEmptyRows(startHora, endHora)
    patient = { id: uuid, cama, nombre, peso, sc, rows, hospitalId, ... }
    storage.savePatient(patient)
    navegar a [[patient-screen]] con id
```

## Exportar

```
exportar(pacientesSeleccionados):
  hospitalesUsados ← hospitales de los pacientes
  share.sharePatients(pacientes, hospitalesUsados)  // ver [[share]]
```

## Renderizado de lista

```
PatientCard(patient):
  mostrar: cama, nombre, edad, peso, SC
  calcular bloques BH/DH con [[calculations]].calcBlocks(rows, peso, sc, table) — sin tabla se muestra "—"
  colorear BH según rango:
    > 0   → azul (positivo)
    < 0   → rojo (negativo)
    = 0   → verde
  al tocar → navegar a [[patient-screen]]
  swipe → eliminar (con confirmación)
```

## Helpers locales

```
formatHora(hora, timeFormat)      // '24h' o '12h'
formatDate(isoString)             // DD/MM/YYYY
getBHColor(bh) → color string
```
