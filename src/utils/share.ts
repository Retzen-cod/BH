import JSZip from 'jszip';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { Patient } from '../types';
import { HospitalConfig } from '../types/hospital';

export async function sharePatients(patients: Patient[], allHospitals: HospitalConfig[]) {
  try {
    const usedIds = [...new Set(patients.map(p => p.hospitalId).filter(Boolean))];
    const usedHospitals = usedIds
      .map(id => allHospitals.find(h => h.id === id))
      .filter(Boolean) as HospitalConfig[];

    const label = patients.length === 1 ? `cama_${patients[0].cama}` : `${patients.length}_pacientes`;
    const zip = new JSZip();

    zip.file('hospitals.json', JSON.stringify(usedHospitals, null, 2));
    for (const patient of patients) {
      zip.file(`cama_${patient.cama}.json`, JSON.stringify(patient, null, 2));
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
