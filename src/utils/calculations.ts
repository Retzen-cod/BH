import { TableRow, BlockSummary } from '../types';
import { ColDef, TableConfig, ScFormula, ScTramo, MantFormula } from '../types/hospital';

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

const SC_FORMULAS: Record<ScFormula, (peso: number) => number> = {
  adulto:     (peso) => (peso * 4 + 7) / (peso + 90),
  pediatrica: (peso) => (peso * 4 + 9) / 100,
};

/** Tramo de SC que aplica a este peso según la tabla (undefined → adulto sin etiqueta). */
function scTramo(peso: number, table?: TableConfig): ScTramo | undefined {
  return table?.sc?.find(t => t.maxPeso == null || peso <= t.maxPeso);
}

/** true si la SC de este paciente se calcula con talla (la tabla lo declara y hay talla). */
function usaTalla(table?: TableConfig, talla?: number): talla is number {
  return !!table?.scConTalla && talla != null && talla > 0;
}

/**
 * SC en m². Con `scConTalla` y talla → Mosteller; si no, los tramos por peso de la
 * tabla; sin tabla o sin tramos → fórmula adulto.
 */
export function calcSC(peso: number, table?: TableConfig, talla?: number): number {
  if (usaTalla(table, talla)) {
    return parseFloat(Math.sqrt(talla * peso / 3600).toFixed(2));
  }
  const formula = scTramo(peso, table)?.formula ?? 'adulto';
  return parseFloat(SC_FORMULAS[formula](peso).toFixed(2));
}

/** Texto para mostrar junto a la SC: fórmula con talla (si aplica) + etiqueta del tramo. */
export function scDetalle(peso: number, table?: TableConfig, talla?: number): string {
  return [usaTalla(table, talla) ? 'Mosteller' : null, scEtiqueta(peso, table)]
    .filter(Boolean).join(' · ');
}

/** Etiqueta del tramo (e.g. "Pediátrico"), si la tabla la declara. */
export function scEtiqueta(peso: number, table?: TableConfig): string | undefined {
  return scTramo(peso, table)?.etiqueta;
}

// ─── Mantenimiento ───────────────────────────────────────────────────────────

const MANT_FORMULAS: Record<MantFormula, (peso: number) => number> = {
  /** mL/día: 100/kg (0–10 kg) + 50/kg (10–20 kg) + 20/kg (> 20 kg) */
  hollidaySegar: (peso) =>
    peso <= 10 ? 100 * peso
    : peso <= 20 ? 1000 + 50 * (peso - 10)
    : 1500 + 20 * (peso - 20),
};

/** Mantenimiento en mL/día según la tabla; undefined si la tabla no lo declara. */
export function calcMantDiario(peso: number, table: TableConfig): number | undefined {
  if (!table.mantenimiento || peso <= 0) return undefined;
  return MANT_FORMULAS[table.mantenimiento.formula](peso);
}

// ─── Columnas del balance ────────────────────────────────────────────────────

/**
 * Keys de TableRow que suman a un grupo del balance, según las columnas de la
 * propia tabla. Incluye las alternates aunque estén ocultas: si se anotó un
 * volumen, se administró/eliminó y debe contar. Excluye T/A, readOnly e isTotal.
 */
export function groupKeys(cols: ColDef[], group: string): string[] {
  const keys: string[] = [];
  for (const c of cols) {
    for (const col of [c, ...(c.alternates ?? [])]) {
      if (col.group === group && !col.readOnly && !col.isTotal && !col.isTA) keys.push(col.key);
    }
  }
  return keys;
}

export function sumKeys(row: TableRow, keys: string[]): number {
  return keys.reduce((acc, k) => acc + ((row as any)[k] ?? 0), 0);
}

// ─── Bloques de 4 horas ──────────────────────────────────────────────────────

/**
 * Calcula los bloques de 4h. Qué columnas son ingresos/egresos/orina lo decide
 * la tabla (`balance` + `dataCols`), así cambiar una tabla no afecta los
 * cálculos de otra.
 * @param peso kg — para DH = orina / peso / horas
 * @param sc  m² — para PI = SC × 400 / 24 × horas_bloque
 */
export function calcBlocks(
  rows: TableRow[], peso: number, sc: number, table: TableConfig,
): BlockSummary[] {
  const ingKeys  = groupKeys(table.dataCols, table.balance?.ingresosGroup ?? 'ing');
  const egrKeys  = groupKeys(table.dataCols, table.balance?.egresosGroup  ?? 'egr');
  const orinaKey = table.balance?.orinaKey ?? 'orina';
  const mantDia  = calcMantDiario(peso, table);

  const blocks: BlockSummary[] = [];
  const numBlocks = Math.ceil(rows.length / 4);

  for (let b = 0; b < numBlocks; b++) {
    const start = b * 4;
    const blockRows = rows.slice(start, start + 4);
    const h = blockRows.length; // horas reales del bloque (puede ser < 4 en el último)

    const pi = parseFloat(((sc * 400 / 24) * h).toFixed(2));
    const e  = blockRows.reduce((acc, r) => acc + sumKeys(r, ingKeys), 0);
    const egresosRaw = blockRows.reduce((acc, r) => acc + sumKeys(r, egrKeys), 0);
    const s  = egresosRaw + pi;
    const orina = blockRows.reduce((acc, r) => acc + ((r as any)[orinaKey] ?? 0), 0);
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
      ...(mantDia != null && { mant: parseFloat((mantDia / 24 * h).toFixed(2)) }),
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
