import AsyncStorage from '@react-native-async-storage/async-storage';
import { HospitalConfig, TableConfig } from '../types/hospital';

const KEY = 'bh_custom_hospitals';

/** id de la tabla creada al migrar un hospital antiguo (una sola tabla, sin `tables`). */
export const LEGACY_TABLE_ID = 'principal';

/**
 * Convierte un hospital del formato antiguo ({ groups, dataCols, ... } al nivel del
 * hospital) al formato con `tables`. Los ya migrados se devuelven tal cual.
 * Se usa al leer AsyncStorage y al importar .bhd de versiones anteriores.
 */
export function normalizeHospital(raw: any): HospitalConfig {
  if (Array.isArray(raw?.tables)) return raw as HospitalConfig;
  const { id, name, abbreviation, isCustom, ...tableFields } = raw ?? {};
  return {
    id, name, abbreviation, isCustom,
    tables: [{ id: LEGACY_TABLE_ID, name: name ?? 'Tabla', ...tableFields } as TableConfig],
  };
}

export async function getCustomHospitals(): Promise<HospitalConfig[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as any[]).map(normalizeHospital);
}

export async function saveCustomHospital(h: HospitalConfig): Promise<void> {
  const list = await getCustomHospitals();
  const idx  = list.findIndex((x) => x.id === h.id);
  if (idx >= 0) list[idx] = h;
  else list.push(h);
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function deleteCustomHospital(id: string): Promise<void> {
  const list = await getCustomHospitals();
  await AsyncStorage.setItem(KEY, JSON.stringify(list.filter((h) => h.id !== id)));
}

/**
 * Guarda (o reemplaza) tablas de un hospital. Si el hospital es integrado, se guarda
 * una entrada custom con el mismo id que solo aporta tablas extra
 * (ver getAllHospitalsAsync, que las fusiona).
 */
export async function saveCustomTables(
  hospital: Pick<HospitalConfig, 'id' | 'name' | 'abbreviation'>, tables: TableConfig[],
): Promise<void> {
  const list  = await getCustomHospitals();
  const entry = list.find((x) => x.id === hospital.id)
    ?? { id: hospital.id, name: hospital.name, abbreviation: hospital.abbreviation, isCustom: true, tables: [] };
  for (const t of tables) {
    const idx = entry.tables.findIndex((x) => x.id === t.id);
    if (idx >= 0) entry.tables[idx] = t;
    else entry.tables.push(t);
  }
  await saveCustomHospital(entry);
}

export async function deleteCustomTable(hospitalId: string, tableId: string): Promise<void> {
  const list  = await getCustomHospitals();
  const entry = list.find((x) => x.id === hospitalId);
  if (!entry) return;
  entry.tables = entry.tables.filter((t) => t.id !== tableId);
  if (entry.tables.length === 0) await deleteCustomHospital(hospitalId);
  else await saveCustomHospital(entry);
}
