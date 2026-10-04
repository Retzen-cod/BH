# share — Empaquetado y envío de archivos .bhd

`src/utils/share.ts`

Ver también: [[index]], [[types]], [[hospitals]], [[storage]], [[patient-list]]

---

## Formato .bhd

Un archivo `.bhd` es un **ZIP renombrado** (WhatsApp lo transmite sin modificar).

```
bh_cama_5.bhd  (zip)
  ├── hospitals.json    ← HospitalConfig[] con SOLO las tablas que usan estos pacientes
  └── cama_5.json       ← Patient data
  // si hay varios pacientes: cama_X.json, cama_Y.json …
```

**v1 (legacy):** JSON plano `Patient | Patient[]` sin zip.
**v2:** ZIP con `hospitals.json` (hospitales de una sola tabla: `groups`/`dataCols` al nivel del hospital) + archivos de pacientes.
**Actual:** mismo ZIP, pero cada hospital trae `tables: TableConfig[]` y cada paciente `tableId`. Se distingue de v2 por la presencia de `tables`.

---

## sharePatients(patients, allHospitals)

```
sharePatients(patients, allHospitals):
  // 1. Recopilar hospitales usados, cada uno solo con las tablas que se usan
  para cada patient:
    table ← findTable(hospital(patient), patient.tableId)
    usedHospitals[hospitalId].tables ∪= table

  // 2. Construir el ZIP
  label ← si 1 paciente: "cama_X" sino: "N_pacientes"
  zip ← JSZip.new()
  zip.file('hospitals.json', JSON.stringify(usedHospitals))
  para cada patient:
    zip.file("cama_${patient.cama}.json", JSON.stringify({ ...patient, tableId: table.id }))
    // tableId explícito: en el receptor la primera tabla del hospital puede ser otra

  // 3. Escribir en caché y compartir
  base64 ← zip.generateAsync({ type: 'base64' })
  path   ← FileSystem.cacheDirectory + "bh_${label}.bhd"
  FileSystem.writeAsStringAsync(path, base64, encoding=Base64)

  si Sharing.isAvailable():
    Sharing.shareAsync(path, mimeType='application/zip')
  sino:
    Alert('No disponible')
```

---

## Importar .bhd (en [[patient-list]])

```
importBHDData(uri):
  bytes ← FileSystem.readAsStringAsync(uri, base64)
  zip   ← JSZip.loadAsync(bytes)

  // Detectar versión
  si zip contiene 'hospitals.json':     // v2
    hospitals ← JSON.parse(zip['hospitals.json'])
    para cada hospital crudo:
      h ← normalizeHospital(crudo)             // v2 → una tabla 'principal'
      si no existe en el dispositivo:
        storage.saveCustomHospital(h)          // embeber para portabilidad
      si existe y no es v2:
        storage.saveCustomTables(h, tablas que falten)   // nunca sobrescribe tablas existentes
      si existe y es v2:
        nada — sus pacientes (sin tableId) usan la primera tabla local

    archivos ← zip.files sin 'hospitals.json'
    pacientes ← archivos.map(f → JSON.parse(f.content))

  sino:                                 // v1 fallback
    contenido ← zip.file(primerArchivo).async('text')
    pacientes ← JSON.parse(contenido)  // Patient | Patient[]
    si no es array → [paciente]

  para cada paciente:
    storage.importPatient(paciente)

  recargar lista de pacientes
```

---

## Fórmulas

Todo lo que afecta cálculos (balance, tramos de SC) se declara como datos en la `TableConfig`,
así que viaja en `hospitals.json` y el receptor calcula exactamente igual.
Ver [[calculations]] y [[hospitals]].
