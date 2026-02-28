import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bh_settings';

export interface Settings {
  timeFormat: '12h' | '24h';
  hospitalId: string;
}

const DEFAULTS: Settings = { timeFormat: '24h', hospitalId: 'HNSJDDSM' };

export async function getSettings(): Promise<Settings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return { ...DEFAULTS };
  return { ...DEFAULTS, ...JSON.parse(raw) };
}

export async function saveSettings(partial: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated = { ...current, ...partial };
  await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  return updated;
}

export function formatHora(hora: string, format: '12h' | '24h'): string {
  if (format === '24h') return hora;
  const h = parseInt(hora.split(':')[0], 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:00 ${suffix}`;
}

export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch {
    return '';
  }
}
