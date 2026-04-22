# share — Empaquetado y envío de archivos .bhd

`src/utils/share.ts`

Ver también: [[index]], [[types]], [[hospitals]], [[storage]], [[patient-list]]

---

## Formato .bhd

Un archivo `.bhd` es un **ZIP renombrado** (WhatsApp lo transmite sin modificar).

```
bh_cama_5.bhd  (zip)
  ├── hospitals.json    ← HospitalConfig[] de los hospitales usados
  └── cama_5.json       ← Patient data
  // si hay varios pacientes: cama_X.json, cama_Y.json …
```

**v1 (legacy):** JSON plano `Patient | Patient[]` sin zip.
**v2 (actual):** ZIP con `hospitals.json` + archivos de pacientes.

---

## sharePatients(patients, allHospitals)

```
sharePatients(patients, allHospitals):
  // 1. Recopilar hospitales usados
  usedIds       ← unique(patients.map(p → p.hospitalId))
  usedHospitals ← usedIds.map(id → allHospitals.find(h → h.id == id))

  // 2. Construir el ZIP
  label ← si 1 paciente: "cama_X" sino: "N_pacientes"
  zip ← JSZip.new()
  zip.file('hospitals.json', JSON.stringify(usedHospitals))
  para cada patient:
    zip.file("cama_${patient.cama}.json", JSON.stringify(patient))

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
    para cada hospital:
      si no existe en STATIC ni en custom:
        storage.saveCustomHospital(hospital)   // embeber para portabilidad

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

## Nota sobre funciones no serializables

`HospitalConfig.calcSC` es una función → **no se guarda en el JSON** del ZIP.
Al importar, el receptor usará la fórmula estándar `(peso×4+7)/(peso+90)`.
Ver [[calculations]] y [[hospitals]].
