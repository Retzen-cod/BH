import AsyncStorage from '@react-native-async-storage/async-storage';
import { Patient } from '../types';

const KEY = 'bh_patients';

async function loadAll(): Promise<Patient[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  return JSON.parse(raw) as Patient[];
}

async function saveAll(patients: Patient[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(patients));
}

export async function getPatients(): Promise<Patient[]> {
  return loadAll();
}

export async function getPatient(id: string): Promise<Patient | undefined> {
  const all = await loadAll();
  return all.find((p) => p.id === id);
}

export async function savePatient(patient: Patient): Promise<void> {
  const all = await loadAll();
  const idx = all.findIndex((p) => p.id === patient.id);
  if (idx >= 0) {
    all[idx] = patient;
  } else {
    all.push(patient);
  }
  await saveAll(all);
}

export async function deletePatient(id: string): Promise<void> {
  const all = await loadAll();
  await saveAll(all.filter((p) => p.id !== id));
}

export async function importPatient(patient: Patient): Promise<void> {
  // Si ya existe una cama con el mismo id, la reemplaza
  await savePatient(patient);
}
