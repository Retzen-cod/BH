import { HospitalConfig, TableConfig } from '../types/hospital';
import { HNSJDDSM } from './HNSJDDSM';
import { getCustomHospitals } from '../utils/hospitalStorage';

// ─── Registro estático ────────────────────────────────────────────────────────
// Para agregar un nuevo hospital integrado:
//   1. Crea src/hospitals/NUEVO/ con un archivo por tabla (TableConfig) y un index.ts (HospitalConfig)
//   2. Impórtalo aquí y agrégalo al registro

const STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,
};

export function getAllHospitals(): HospitalConfig[] {
  return Object.values(STATIC);
}

/** true si la tabla viene en el código (no editable ni borrable desde la app). */
export function isBuiltInTable(hospitalId: string, tableId: string): boolean {
  return !!STATIC[hospitalId]?.tables.some(t => t.id === tableId);
}

/** Tabla del paciente dentro de su hospital; sin tableId (pacientes antiguos) → la primera. */
export function findTable(hospital: HospitalConfig, tableId?: string): TableConfig {
  return hospital.tables.find(t => t.id === tableId) ?? hospital.tables[0];
}

// ─── Acceso asíncrono (integrados + personalizados) ───────────────────────────

/**
 * Integrados + personalizados. Una entrada custom con el id de un hospital integrado
 * le añade tablas (las integradas tienen prioridad si el id de tabla coincide).
 */
export async function getAllHospitalsAsync(): Promise<HospitalConfig[]> {
  const customs = await getCustomHospitals();
  const merged  = Object.values(STATIC).map((h) => {
    const extra = customs.find(c => c.id === h.id)?.tables
      .filter(t => !h.tables.some(s => s.id === t.id)) ?? [];
    return extra.length ? { ...h, tables: [...h.tables, ...extra] } : h;
  });
  return [...merged, ...customs.filter(c => !STATIC[c.id])];
}

export async function getHospitalAsync(id?: string): Promise<HospitalConfig> {
  const all = await getAllHospitalsAsync();
  return all.find(h => h.id === id) ?? HNSJDDSM;
}
