# patient-screen — Pantalla de tabla del paciente

`app/patient/[id].tsx`

Ver también: [[index]], [[patient-table]], [[types]], [[storage]], [[hospitals]], [[calculations]], [[share]]

---

## Responsabilidades

Este contenedor maneja:
- Orientación de pantalla (forzar landscape)
- Carga de `Patient` + `HospitalConfig`
- Historial undo/redo sobre `rows`
- Debounce de guardado (600 ms)
- Callbacks que bajan a [[patient-table]]

---

## Estado

```
state:
  patient:  Patient | null
  hospital: HospitalConfig | null
  settings: Settings
  rowsHistory: useUndoRedo<TableRow[]>
  saveTimer: ref<Timeout>
```

## Ciclo de vida

```
onMount():
  ScreenOrientation.lock(LANDSCAPE)
  NavigationBar.hide()

  patient  ← storage.getPatient(id)
  hospital ← hospitals.getHospitalAsync(patient.hospitalId)
  table    ← hospitals.findTable(hospital, patient.tableId)   // se pasa a PatientTable
  settings ← storage.getSettings()
  rowsHistory.reset(patient.rows)

onUnmount():
  ScreenOrientation.unlock()
```

## Persistencia con debounce

```
persist(patient):
  cancelar timer anterior
  timer ← setTimeout(600ms):
    storage.savePatient(patient)   // ver [[storage]]
```

## Edición de celdas

```
applyRowUpdate(rows, rowIndex, colKey, raw) → TableRow[]:
  clonar rows
  si colKey == 'ta':
    row.ta  = raw
    row.pam = calcPAM(raw)        // ver [[calculations]]
  sino:
    row[colKey] = parseFloat(raw)
  retornar rows actualizadas

handleUpdateCell(rowIndex, colKey, raw):
  rows ← applyRowUpdate(patient.rows, rowIndex, colKey, raw)
  rowsHistory.push(rows)
  patient ← { ...patient, rows }
  setPatient(patient)
  persist(patient)

handleBatchUpdateCells(updates[]):
  rows ← patient.rows
  para cada update:
    rows ← applyRowUpdate(rows, update.rowIndex, update.colKey, update.raw)
  rowsHistory.push(rows)          // un solo paso en historial
  setPatient({ ...patient, rows })
  persist(patient)
```

## Undo / Redo

```
handleUndo():
  prev ← rowsHistory.undo()
  si prev → applyRows(patient, prev)

handleRedo():
  next ← rowsHistory.redo()
  si next → applyRows(patient, next)
```

## Otras acciones

```
handleToggleBlock(blockIndex):
  disabledBlocks ← toggle blockIndex en patient.disabledBlocks
  persist({ ...patient, disabledBlocks })

handleColOverride(slotKey, activeKey):
  colOverrides ← { ...patient.colOverrides }
  si activeKey == null → borrar colOverrides[slotKey]
  sino → colOverrides[slotKey] = activeKey
  persist({ ...patient, colOverrides })

handleEditInfo(updated):
  setPatient(updated)
  persist(updated)

handleExport():
  share.sharePatients([patient], [hospital])  // ver [[share]]
```

## Render

```
si !patient || !hospital → ActivityIndicator

sino:
  <PatientTable                    // ver [[patient-table]]
    patient, hospital, settings
    onUpdateCell, onBatchUpdateCells
    onUndo, onRedo, canUndo, canRedo
    onToggleBlock, onColOverride
    onEditInfo, onExport
    onBack → router.back()
  />
```
