import { TableRow, BlockSummary } from '../types';

// ─── Signos vitales ──────────────────────────────────────────────────────────

export function calcPAM(ta: string): number | undefined {
  const parts = ta.split('/');
  if (parts.length !== 2) return undefined;
  const s = parseFloat(parts[0]);
  const d = parseFloat(parts[1]);
  if (isNaN(s) || isNaN(d)) return undefined;
  return Math.round((s + 2 * d) / 3);
}

// ─── Datos del paciente ──────────────────────────────────────────────────────

/** SC = (peso × 4 + 7) / (peso + 90) */
export function calcSC(peso: number): number {
  return parseFloat(((peso * 4 + 7) / (peso + 90)).toFixed(2));
}

// ─── Totales por fila ────────────────────────────────────────────────────────

export function totalIngresos(row: TableRow): number {
  return (
    (row.cristaloides ?? 0) + (row.coloides ?? 0) +
    (row.dopamina ?? 0) + (row.dobutamina ?? 0) + (row.norepinefrina ?? 0) +
    (row.vasopresina ?? 0) +
    // bucket sedantes + todos sus alternates individuales
    (row.sedantes ?? 0) +
    (row.ketamina ?? 0) + (row.fentanilo ?? 0) + (row.remifentanilo ?? 0) +
    (row.midazolam ?? 0) + (row.cisatracurio ?? 0) +
    (row.insulina ?? 0) +
    (row.medicamentos ?? 0) + (row.dextrosa ?? 0) +
    (row.enteral ?? 0) + (row.hemoderivados ?? 0) + (row.otrosIngresos ?? 0)
  );
}

export function totalEgresos(row: TableRow): number {
  return (
    (row.orina ?? 0) + (row.evacuaciones ?? 0) +
    (row.aspiraciones ?? 0) + (row.otrosEgresos ?? 0)
  );
}

// ─── Bloques de 4 horas ──────────────────────────────────────────────────────

/**
 * Calcula los bloques de 4h.
 * @param peso kg — para DH = orina / peso / horas
 * @param sc  m² — para PI = SC × 400 / 24 × horas_bloque
 */
export function calcBlocks(rows: TableRow[], peso: number, sc: number): BlockSummary[] {
  const blocks: BlockSummary[] = [];
  const numBlocks = Math.ceil(rows.length / 4);

  for (let b = 0; b < numBlocks; b++) {
    const start = b * 4;
    const blockRows = rows.slice(start, start + 4);
    const h = blockRows.length; // horas reales del bloque (puede ser < 4 en el último)

    const pi = parseFloat(((sc * 400 / 24) * h).toFixed(2));
    const e  = blockRows.reduce((acc, r) => acc + totalIngresos(r), 0);
    const egresosRaw = blockRows.reduce((acc, r) => acc + totalEgresos(r), 0);
    const s  = egresosRaw + pi;
    const orina = blockRows.reduce((acc, r) => acc + (r.orina ?? 0), 0);
    const dh = peso > 0 ? parseFloat((orina / peso / h).toFixed(2)) : 0;

    blocks.push({
      blockIndex: b,
      startHora: rows[start].hora,
      endHora: rows[start + h - 1].hora,
      pi,
      e,
      s,
      bh: parseFloat((e - s).toFixed(2)),
      dh,
    });
  }
  return blocks;
}

/** BH Total = Σ BH (suma algebraica con signo) */
export function calcBHTotal(blocks: BlockSummary[]): number {
  return parseFloat(blocks.reduce((acc, b) => acc + b.bh, 0).toFixed(2));
}

/** DH Total = Σ DH / número de bloques */
export function calcDHTotal(blocks: BlockSummary[]): number {
  if (blocks.length === 0) return 0;
  return parseFloat((blocks.reduce((acc, b) => acc + b.dh, 0) / blocks.length).toFixed(2));
}

// ─── Filas vacías ────────────────────────────────────────────────────────────

/**
 * Genera filas vacías desde startHora hasta endHora (exclusive).
 * Si start === end se asume 24h.
 */
export function buildEmptyRows(
  startHora: string = '07:00',
  endHora: string = '07:00',
): TableRow[] {
  const startH = parseInt(startHora.split(':')[0], 10);
  const endH   = parseInt(endHora.split(':')[0], 10);
  let numHours = endH - startH;
  if (numHours <= 0) numHours += 24;

  return Array.from({ length: numHours }, (_, i) => ({
    hora: `${String((startH + i) % 24).padStart(2, '0')}:00`,
  }));
}
