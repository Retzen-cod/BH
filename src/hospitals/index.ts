import { HospitalConfig } from '../types/hospital';
import { HNSJDDSM } from './HNSJDDSM';
import { getCustomHospitals } from '../utils/hospitalStorage';

// ─── Registro estático ────────────────────────────────────────────────────────
// Para agregar un nuevo hospital integrado:
//   1. Crea src/hospitals/NUEVO.ts con su HospitalConfig
//   2. Impórtalo aquí y agrégalo al registro

const STATIC: Record<string, HospitalConfig> = {
  HNSJDDSM,
};

// ─── Acceso síncrono (solo hospitales integrados) ─────────────────────────────

export function getHospital(id?: string): HospitalConfig {
  return (id && STATIC[id]) ? STATIC[id] : HNSJDDSM;
}

export function getAllHospitals(): HospitalConfig[] {
  return Object.values(STATIC);
}

// ─── Acceso asíncrono (integrados + personalizados) ───────────────────────────

export async function getHospitalAsync(id?: string): Promise<HospitalConfig> {
  if (!id) return HNSJDDSM;
  if (STATIC[id]) return STATIC[id];
  const customs = await getCustomHospitals();
  return customs.find((h) => h.id === id) ?? HNSJDDSM;
}

export async function getAllHospitalsAsync(): Promise<HospitalConfig[]> {
  const customs = await getCustomHospitals();
  return [...Object.values(STATIC), ...customs];
}
