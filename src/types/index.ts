// ─── Fila de tabla (1 por hora) ─────────────────────────────────────────────
export interface TableRow {
  hora: string;

  // Signos vitales
  ta?: string;    // "120/80"
  pam?: number;   // auto: (S + 2D) / 3
  fc?: number;
  fr?: number;
  so2?: number;
  temp?: number;
  hgt?: number;

  // Ingresos (mL)
  cristaloides?: number;
  coloides?: number;
  norepinefrina?: number;
  dobutamina?: number;
  dopamina?: number;
  vasopresina?: number;
  ketamina?: number;
  fentanilo?: number;
  remifentanilo?: number;
  midazolam?: number;
  cisatracurio?: number;
  dextrosa?: number;
  medicamentos?: number;
  enteral?: number;
  hemoderivados?: number;
  otrosIngresos?: number;

  // Egresos (mL)
  orina?: number;
  evacuaciones?: number;
  aspiraciones?: number;
  otrosEgresos?: number;
}

// ─── Resumen por bloque de 4h (calculado, no almacenado) ────────────────────
export interface BlockSummary {
  blockIndex: number;
  startHora: string;
  endHora: string;
  pi: number;   // SC × 400 / 24 × horas_bloque
  e: number;    // Σ ingresos
  s: number;    // Σ egresos + PI
  bh: number;   // E − S
  dh: number;   // Σ orina / peso / horas_bloque  (mL/kg/h)
}

// ─── Paciente ────────────────────────────────────────────────────────────────
export interface Patient {
  id: string;
  cama: string;
  nombre?: string;
  edad?: number;
  registro?: string;
  peso?: number;      // kg  — obligatorio para DH y PI
  talla?: number;     // cm
  sc?: number;        // auto: (peso×4+7)/(peso+90)
  startHora: string;  // "07:00"
  endHora: string;    // "07:00" (igual a start = 24h)
  hospitalId: string; // clave del hospital — e.g. "HNSJDDSM"
  createdAt: string;
  rows: TableRow[];
}
