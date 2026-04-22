# templates — Editor de hospitales custom

`app/templates.tsx`

Ver también: [[index]], [[navigation]], [[types]], [[hospitals]], [[storage]]

> Pantalla de desarrollo. Oculta en producción.

---

## Propósito

Permite al usuario crear y editar `HospitalConfig` personalizadas sin código.
Los hospitales creados aquí se guardan en AsyncStorage como `isCustom: true`.

---

## Estado

```
state:
  hospitals: HospitalConfig[]    // integrados + custom
  editTarget: HospitalConfig | null   // hospital en edición
  mode: 'list' | 'edit'
```

---

## Flujo principal

```
onMount():
  hospitals ← hospitals.getAllHospitalsAsync()

// Lista
mostrar lista de hospitales:
  integrados: solo lectura (isCustom == false)
  custom: editable, eliminable

// Crear nuevo
onCrearNuevo():
  editTarget ← plantilla vacía con isCustom=true
  mode ← 'edit'

// Editar
onEditar(hospital):
  editTarget ← copia del hospital
  mode ← 'edit'

// Eliminar
onEliminar(id):
  storage.deleteCustomHospital(id)
  recargar lista
```

---

## Editor de HospitalConfig

```
EditorForm(hospital):
  campos básicos:
    id, name, abbreviation

  editor de groups:
    lista de GroupDef
    agregar / eliminar / reordenar
    para cada group: key, label, bg, textColor, cellBg

  editor de dataCols:
    lista de ColDef
    agregar / eliminar / reordenar
    para cada col: key, label, width, group, isTA, readOnly, isTotal
    para cols con alternates: sub-lista de ColDef

  editor de patientFields:
    para cada campo (nombre, edad, registro, talla):
      selector: 'hidden' | 'optional' | 'required'

  onGuardar():
    validar: id único, al menos 1 group, al menos 1 col
    hospital.isCustom = true
    storage.saveCustomHospital(hospital)
    mode ← 'list'
```

---

## Relación con el sistema de hospitales

```
hospital custom creado aquí
  → guardado en AsyncStorage (ver [[storage]])
  → disponible via hospitals.getHospitalAsync() (ver [[hospitals]])
  → embebido en .bhd al exportar (ver [[share]])
  → importado automáticamente al recibir .bhd en otro dispositivo
```
