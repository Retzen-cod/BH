# BH App — Mapa de la Base de Código

Grafo de pseudocódigo de la aplicación de balance hídrico.

---

## Nodos

### Navegación
- [[navigation]] — Raíz de la app, rutas, providers

### Pantallas
- [[patient-list]] — Lista de pacientes (`app/index.tsx`)
- [[patient-screen]] — Tabla hourly de un paciente (`app/patient/[id].tsx`)
- [[templates]] — Editor de hospitales custom (`app/templates.tsx`)

### Componentes
- [[patient-table]] — Tabla interactiva principal

### Gestos
- [[gestures]] — Sistema de gestos extensible

### Datos y tipos
- [[types]] — Modelos de datos (`Patient`, `TableRow`, `HospitalConfig`, …)
- [[hospitals]] — Registro de hospitales (estáticos + custom)

### Utilidades
- [[calculations]] — Funciones puras: PAM, SC, bloques BH/DH
- [[storage]] — CRUD AsyncStorage para pacientes, hospitales, settings
- [[share]] — Empaquetado y envío de archivos `.bhd`

---

## Flujo principal

```
Usuario abre app
  → [[navigation]] monta providers
  → [[patient-list]] carga pacientes de [[storage]]
  → toca paciente
  → [[patient-screen]] carga Patient + HospitalConfig de [[hospitals]]
  → renderiza [[patient-table]]
  → ediciones → [[calculations]] → debounce → [[storage]]
  → exportar → [[share]]
```
