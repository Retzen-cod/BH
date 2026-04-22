# navigation — Raíz de la app

`app/_layout.tsx`

Ver también: [[index]], [[patient-list]], [[patient-screen]], [[templates]]

---

## Pseudocódigo

```
RootLayout():
  envolver todo en:
    SafeAreaProvider
      ShareIntentProvider          // maneja apertura de .bhd desde WhatsApp
        GestureHandlerRootView     // habilita gestos RNGH en toda la app
          Stack (Expo Router)
            Screen "index"         → [[patient-list]]
            Screen "patient/[id]"  → [[patient-screen]]
            Screen "templates"     → [[templates]]
```

## Providers y sus roles

| Provider | Rol |
|---|---|
| `SafeAreaProvider` | Insets de notch/barra en iOS y Android |
| `ShareIntentProvider` | Detecta intent de apertura de `.bhd` y lo expone via hook |
| `GestureHandlerRootView` | Contexto raíz para todos los gestos RNGH |

## Routing (Expo Router — file-based)

```
app/
  _layout.tsx          ← este archivo
  index.tsx            ← ruta "/"
  patient/
    [id].tsx           ← ruta "/patient/:id"
  templates.tsx        ← ruta "/templates"
```

El entry point real es `expo-router/entry`, no `App.tsx`.
