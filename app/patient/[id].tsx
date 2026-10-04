import React, { useEffect, useRef, useCallback, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { Patient, TableRow } from '../../src/types';
import { HospitalConfig } from '../../src/types/hospital';
import { getHospitalAsync, findTable } from '../../src/hospitals';
import { getPatient, savePatient } from '../../src/utils/storage';
import { sharePatients } from '../../src/utils/share';
import { getSettings, Settings } from '../../src/utils/settings';
import { calcPAM } from '../../src/utils/calculations';
import { useUndoRedo } from '../../src/hooks/useUndoRedo';
import PatientTable from '../../src/components/PatientTable';

export default function PatientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();

  const [patient,  setPatient]  = useState<Patient | null>(null);
  const [hospital, setHospital] = useState<HospitalConfig | null>(null);
  const [settings, setSettings] = useState<Settings>({ timeFormat: '24h', hospitalId: 'HNSJDDSM' });

  useKeepAwake();
  const rowsHistory = useUndoRedo<TableRow[]>([]);
  const saveTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    NavigationBar.setVisibilityAsync('hidden');
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  useEffect(() => {
    if (!id) return;
    getPatient(id).then(async (p) => {
      if (!p) return;
      setPatient(p);
      rowsHistory.reset(p.rows);
      setHospital(await getHospitalAsync(p.hospitalId));
    });
    getSettings().then(setSettings);
  }, [id]);

  const persist = useCallback((updated: Patient) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePatient(updated), 600);
  }, []);

  function applyRows(base: Patient, rows: TableRow[]) {
    const updated = { ...base, rows };
    setPatient(updated);
    persist(updated);
  }

  function applyRowUpdate(rows: TableRow[], rowIndex: number, colKey: string, raw: string): TableRow[] {
    const updated = [...rows];
    const row = { ...updated[rowIndex] };
    if (colKey === 'ta') {
      row.ta  = raw;
      row.pam = calcPAM(raw);
    } else {
      const num = parseFloat(raw);
      (row as any)[colKey] = isNaN(num) ? undefined : num;
    }
    updated[rowIndex] = row;
    return updated;
  }

  function handleUpdateCell(rowIndex: number, colKey: string, raw: string) {
    if (!patient) return;
    const rows = applyRowUpdate(patient.rows, rowIndex, colKey, raw);
    rowsHistory.push(rows);
    applyRows(patient, rows);
  }

  function handleBatchUpdateCells(updates: { rowIndex: number; colKey: string; raw: string }[]) {
    if (!patient) return;
    let rows = patient.rows;
    for (const { rowIndex, colKey, raw } of updates) {
      rows = applyRowUpdate(rows, rowIndex, colKey, raw);
    }
    rowsHistory.push(rows);
    applyRows(patient, rows);
  }

  function handleUndo() {
    if (!patient) return;
    const prev = rowsHistory.undo();
    if (prev) applyRows(patient, prev);
  }

  function handleRedo() {
    if (!patient) return;
    const next = rowsHistory.redo();
    if (next) applyRows(patient, next);
  }

  function handleToggleBlock(blockIndex: number) {
    if (!patient) return;
    const disabled = patient.disabledBlocks ?? [];
    const next = disabled.includes(blockIndex)
      ? disabled.filter(i => i !== blockIndex)
      : [...disabled, blockIndex];
    const updated = { ...patient, disabledBlocks: next };
    setPatient(updated);
    persist(updated);
  }

  function handleColOverride(slotKey: string, activeKey: string | null) {
    if (!patient) return;
    const overrides = { ...(patient.colOverrides ?? {}) };
    if (activeKey === null) {
      delete overrides[slotKey];
    } else {
      overrides[slotKey] = activeKey;
    }
    const updated = { ...patient, colOverrides: overrides };
    setPatient(updated);
    persist(updated);
  }

  function handleColLabelChange(slotKey: string, label: string | null) {
    if (!patient) return;
    const labels = { ...(patient.colLabels ?? {}) };
    if (label === null) {
      delete labels[slotKey];
    } else {
      labels[slotKey] = label;
    }
    const updated = { ...patient, colLabels: labels };
    setPatient(updated);
    persist(updated);
  }

  function handleEditInfo(updated: Patient) {
    let final = updated;
    if (patient && updated.startHora !== patient.startHora) {
      const startH = parseInt(updated.startHora.split(':')[0], 10);
      const newRows = updated.rows.map((row, i) => ({
        ...row,
        hora: `${String((startH + i) % 24).padStart(2, '0')}:00`,
      }));
      final = { ...updated, rows: newRows };
      rowsHistory.reset(newRows);
    }
    setPatient(final);
    persist(final);
  }

  async function handleExport() {
    if (!patient || !hospital) return;
    await sharePatients([patient], [hospital]);
  }

  if (!patient || !hospital) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  return (
    <PatientTable
      patient={patient}
      hospital={hospital}
      table={findTable(hospital, patient.tableId)}
      settings={settings}
      onUpdateCell={handleUpdateCell}
      onBatchUpdateCells={handleBatchUpdateCells}
      onUndo={handleUndo}
      onRedo={handleRedo}
      canUndo={rowsHistory.canUndo}
      canRedo={rowsHistory.canRedo}
      onToggleBlock={handleToggleBlock}
      onColOverride={handleColOverride}
      onColLabelChange={handleColLabelChange}
      onEditInfo={handleEditInfo}
      onExport={handleExport}
      onBack={() => router.back()}
    />
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
