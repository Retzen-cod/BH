import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { Patient } from '../types';
import { HospitalConfig } from '../types/hospital';
import { findTable } from '../hospitals';

export async function sharePatients(patients: Patient[], allHospitals: HospitalConfig[]) {
  try {
    // Solo se embeben las tablas que usan estos pacientes, agrupadas por hospital.
    const usedHospitals: HospitalConfig[] = [];
    for (const p of patients) {
      const h = allHospitals.find(x => x.id === p.hospitalId);
      if (!h) continue;
      const table = findTable(h, p.tableId);
      let entry = usedHospitals.find(x => x.id === h.id);
      if (!entry) usedHospitals.push(entry = { ...h, tables: [] });
      if (!entry.tables.some(t => t.id === table.id)) entry.tables.push(table);
    }

    const label = patients.length === 1 ? `cama_${patients[0].cama}` : `${patients.length}_pacientes`;
    const zip = new JSZip();

    zip.file('hospitals.json', JSON.stringify(usedHospitals, null, 2));
    for (const patient of patients) {
      // tableId explícito: el receptor puede tener otra tabla como primera del hospital
      const h = allHospitals.find(x => x.id === patient.hospitalId);
      const out = h ? { ...patient, tableId: findTable(h, patient.tableId).id } : patient;
      zip.file(`cama_${patient.cama}.json`, JSON.stringify(out, null, 2));
    }

    const base64 = await zip.generateAsync({ type: 'base64' });
    const path = `${FileSystem.cacheDirectory}bh_${label}.bhd`;
    await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, { mimeType: 'application/zip', dialogTitle: `BH ${label}` });
    } else {
      Alert.alert('No disponible', 'Compartir no está disponible en este dispositivo.');
    }
  } catch { Alert.alert('Error', 'No se pudo compartir.'); }
}
