import { HospitalConfig } from '../types/hospital';
import { HNSJDDSM } from './HNSJDDSM';

// ─── Registro de hospitales ───────────────────────────────────────────────────
// Para agregar un nuevo hospital:
//   1. Crea src/hospitals/NUEVO.ts con su HospitalConfig
//   2. Impórtalo aquí y agrégalo al registro

const REGISTRY: Record<string, HospitalConfig> = {
  HNSJDDSM,
};

export function getHospital(id?: string): HospitalConfig {
  return (id && REGISTRY[id]) ? REGISTRY[id] : HNSJDDSM;
}

export function getAllHospitals(): HospitalConfig[] {
  return Object.values(REGISTRY);
}
