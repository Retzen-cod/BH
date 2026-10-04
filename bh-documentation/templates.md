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
EditorForm(hospital, tabla):   // edita UNA tabla; las demás no se tocan
  campos básicos:
    hospital: name, abbreviation (fijos si el hospital ya existe y es integrado)
    tabla:    name

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
    validar: nombres, al menos 1 group, al menos 1 col
    reemplazar/añadir SOLO esta tabla en la entrada custom del hospital
    storage.saveCustomHospital(entrada)
    mode ← 'list'

Lista: cada hospital (integrado o custom) con sus tablas.
  [+ Tabla] crea una tabla nueva en ese hospital (también en integrados:
  se guarda como entrada custom con el mismo id, ver [[hospitals]]).
  Tablas integradas: solo lectura. Tablas custom: Editar / Eliminar.
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
