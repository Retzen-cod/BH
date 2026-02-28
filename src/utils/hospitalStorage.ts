import AsyncStorage from '@react-native-async-storage/async-storage';
import { HospitalConfig } from '../types/hospital';

const KEY = 'bh_custom_hospitals';

export async function getCustomHospitals(): Promise<HospitalConfig[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  return JSON.parse(raw) as HospitalConfig[];
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
