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

## calcSC(peso) → number

```
// Superficie corporal (m²) — fórmula estándar
calcSC(peso: number):
  retornar round2((peso × 4 + 7) / (peso + 90))
```

Puede ser sobreescrita por `HospitalConfig.calcSC`. Ver [[hospitals]].

---

## totalIngresos(row) → number

```
totalIngresos(row: TableRow):
  sumar todos los campos de ingresos:
    cristaloides, coloides,
    dopamina, dobutamina, norepinefrina, vasopresina,
    sedantes, ketamina, fentanilo, remifentanilo, midazolam, cisatracurio,
    insulina, medicamentos, dextrosa,
    enteral, hemoderivados, otrosIngresos
  (campos undefined cuentan como 0)
```

---

## totalEgresos(row) → number

```
totalEgresos(row: TableRow):
  sumar: orina, evacuaciones, aspiraciones, otrosEgresos
```

---

## calcBlocks(rows, peso, sc) → BlockSummary[]

```
calcBlocks(rows, peso, sc):
  numBloques ← ceil(rows.length / 4)

  para b en 0..numBloques-1:
    filasBloque ← rows[b×4 .. b×4+3]
    h ← filasBloque.length          // puede ser < 4 en el último bloque

    pi    ← round2(sc × 400/24 × h)
    e     ← Σ totalIngresos(fila) para fila en filasBloque
    egres ← Σ totalEgresos(fila) para fila en filasBloque
    s     ← egres + pi
    orina ← Σ fila.orina para fila en filasBloque
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
