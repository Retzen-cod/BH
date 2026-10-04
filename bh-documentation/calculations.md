# calculations — Funciones puras de cálculo

`src/utils/calculations.ts`

Ver también: [[index]], [[types]], [[patient-screen]], [[patient-list]]

Sin efectos secundarios. Todas las funciones son deterministas y testeables.

---

## calcPAM(ta) → number | undefined

```
calcPAM(ta: string):
  partes ← ta.split('/')
  si partes.length ≠ 2 → undefined
  s ← parseFloat(partes[0])
  d ← parseFloat(partes[1])
  si NaN → undefined
  retornar round((s + 2·d) / 3)
```

---

## calcSC(peso, table?) → number · scEtiqueta(peso, table?) → string?

```
SC_FORMULAS:
  adulto:     (peso × 4 + 7) / (peso + 90)
  pediatrica: (peso × 4 + 9) / 100

calcSC(peso, table):
  tramo ← primer table.sc[i] con (maxPeso ausente o peso ≤ maxPeso)
  retornar round2(SC_FORMULAS[tramo?.formula ?? 'adulto'](peso))

scEtiqueta(peso, table):
  retornar tramo?.etiqueta        // e.g. "Pediátrico"
```

Cada tabla declara sus tramos en `TableConfig.sc` (por nombre de fórmula, para que sea serializable).
HNSJDDSM / general: ≤ 10 kg → 'pediatrica' + etiqueta "Pediátrico"; > 10 kg → 'adulto'.

Si la tabla declara `scConTalla: 'mosteller'` y el paciente tiene talla:
`SC = √(talla cm × peso kg / 3600)`; sin talla se usan los tramos. `scDetalle()` devuelve
el texto a mostrar ("Mosteller · Pediátrico"). Solo HNSJDDSM / mantenimiento lo usa.

La SC que usan la tarjeta, el encabezado de la tabla y `calcBlocks` se **deriva siempre** de
`peso` + tabla; `patient.sc` guardado es solo informativo (puede venir de otra fórmula).

---

## groupKeys(cols, group) → string[]

```
groupKeys(table.dataCols, group):
  para cada columna y cada una de sus alternates:
    incluir col.key si col.group = group y no es readOnly / isTotal / isTA
```

Las alternates ocultas **sí** cuentan: si se anotó un volumen, entra al balance.
Lo usan tanto el Total por fila de `PatientTable` como `calcBlocks`, así ambos suman exactamente lo mismo.

No hay lista fija de campos: cada tabla decide qué entra a su balance con sus propias columnas. Cambiar una tabla no afecta a otra.

---

## calcBlocks(rows, peso, sc, table) → BlockSummary[]

```
calcBlocks(rows, peso, sc, table):
  ingKeys  ← groupKeys(table.dataCols, table.balance.ingresosGroup ?? 'ing')
  egrKeys  ← groupKeys(table.dataCols, table.balance.egresosGroup  ?? 'egr')
  orinaKey ← table.balance.orinaKey ?? 'orina'
  numBloques ← ceil(rows.length / 4)

  para b en 0..numBloques-1:
    filasBloque ← rows[b×4 .. b×4+3]
    h ← filasBloque.length          // puede ser < 4 en el último bloque

    pi    ← round2(sc × 400/24 × h)
    e     ← Σ ingKeys de cada fila
    egres ← Σ egrKeys de cada fila
    s     ← egres + pi
    orina ← Σ fila[orinaKey]
    dh    ← si peso > 0: round2(orina / peso / h) sino 0
    bh    ← round2(e - s)

    push BlockSummary { blockIndex:b, startHora, endHora, pi, e, s, bh, dh }
```

---

## calcBHTotal(blocks) → number

```
calcBHTotal(blocks):
  retornar round2(Σ block.bh)     // suma algebraica con signo
```

---

## calcDHTotal(blocks) → number

```
calcDHTotal(blocks):
  si blocks vacío → 0
  retornar round2(Σ block.dh / blocks.length)
```

---

## buildEmptyRows(startHora, endHora) → TableRow[]

```
buildEmptyRows(startHora='07:00', endHora='07:00'):
  startH ← parseInt(startHora)
  endH   ← parseInt(endHora)
  numHoras ← endH - startH
  si numHoras ≤ 0 → numHoras += 24    // cruza medianoche

  retornar Array(numHoras) con:
    { hora: pad2((startH + i) % 24) + ':00' }
```

---

## calcMantDiario(peso, table) → number | undefined

```
si !table.mantenimiento → undefined   // la tabla no cambia
'hollidaySegar' (mL/día):
  peso ≤ 10 → 100 × peso
  peso ≤ 20 → 1000 + 50 × (peso − 10)
  sino      → 1500 + 20 × (peso − 20)
```

En `calcBlocks`: `block.mant = mantDiario / 24 × h`. `PatientTable` muestra M y E − M por bloque
y "Mant. 24h" en el encabezado, solo si la tabla declara `mantenimiento`.
