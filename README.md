# Balance Hídrico 💧

App móvil para registro y cálculo de balances hídricos en entornos hospitalarios. Diseñada para internos, médicos y enfermeras que actualmente hacen estos cálculos a mano con calculadora de celular.

## El problema que resuelve

En hospitales públicos de El Salvador, el registro del balance hídrico se hace en hojas físicas con calculadora. En cada cambio de turno, el médico entrante recibe la hoja a mano o transcribe los datos desde cero. Este proceso es lento, propenso a errores y completamente manual.

Esta app elimina el cálculo manual y hace el traspaso de turno tan simple como mandar un archivo por WhatsApp.

## Características

- **Tabla por paciente** — registro hora a hora de ingresos y egresos
- **Cálculos automáticos** — PAM, SC, PI, BH y DH calculados en tiempo real
- **Bloques de 4h** — resumen automático por bloque con totales acumulados
- **Edición rápida** — triple tap borra una celda; long press + handle para copiar/reemplazar/borrar rangos rectangulares con un solo gesto
- **Cambio de turno** — exporta el paciente como `.bhd` y el receptor lo importa en un tap
- **Multi-hospital** — cada hospital puede tener su propia configuración de columnas y grupos; las configuraciones viajan embebidas en el `.bhd`
- **Sin servidor** — todo corre local, sin internet, sin cuentas, sin suscripciones
- **Distribución por APK** — no requiere Google Play ni App Store

## Stack

- React Native + Expo (Expo Router)
- AsyncStorage para persistencia local
- expo-sharing + expo-document-picker para el flujo de traspaso
- jszip para empaquetado de archivos
- expo-share-intent para recibir `.bhd` compartidos desde WhatsApp
- expo-screen-orientation para modo landscape en la tabla

## Formato de archivo `.bhd`

Formato propietario para transferencia de pacientes entre dispositivos. Internamente es un **zip** (como `.apkg` de Anki), lo que permite que WhatsApp lo transmita sin renombrar ni corromper el archivo.

Estructura del zip:

```
bh_cama_5.bhd  (zip)
├── hospitals.json   — configuraciones de hospital usadas
├── cama_5.json      — datos del paciente
└── cama_7.json      — (si se compartieron varios)
```

El importador es backwards compatible: también acepta el formato JSON plano de versiones anteriores.

## Workflow de cambio de turno

```
Médico A termina turno
  → Long press en la card del paciente
  → "Compartir"
  → Manda el .bhd por WhatsApp

Médico B inicia turno
  → Toca el .bhd en WhatsApp
  → La app abre y lo importa automáticamente
  → El paciente aparece con todos los datos del turno anterior
```

## Agregar un hospital nuevo

Crear un archivo en `src/hospitals/NOMBRE.ts` siguiendo la interfaz `HospitalConfig`:

```typescript
export const MI_HOSPITAL: HospitalConfig = {
  id: 'MI_HOSPITAL',
  name: 'Nombre completo',
  abbreviation: 'MH',
  groups: [...],
  dataCols: [...],
  patientFields: {...},
};
```

Luego registrarlo en `src/hospitals/index.ts`.

## Estado actual

Beta funcional. Import/export operativo. Apertura de `.bhd` directo desde WhatsApp operativa. Edición de rangos por handle implementada.

## Roadmap

- [x] Abrir `.bhd` directamente desde WhatsApp (expo-share-intent)
- [x] Formato zip para evitar renombrado por WhatsApp + soporte multi-paciente en un solo archivo
- [ ] Exportar tabla a PDF (hoja oficial del hospital) — scan de 600 DPI como fondo, datos superpuestos con expo-print
- [ ] Autosync con Google Drive
- [ ] Soporte para más hospitales

---

> Hecho en una tarde porque sacar la calculadora a las 3am ya era demasiado.
