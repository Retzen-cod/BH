import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import { Patient } from '../src/types';
import { getPatients, savePatient, deletePatient, importPatient } from '../src/utils/storage';
import { buildEmptyRows, calcBlocks, calcBHTotal, calcDHTotal, calcSC } from '../src/utils/calculations';
import { getSettings, saveSettings, formatHora, formatDate, Settings } from '../src/utils/settings';
import { getAllHospitals, getHospital } from '../src/hospitals';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bhColor(bh: number): string {
  if (bh > 500) return '#DC2626';
  if (bh < -500) return '#7C3AED';
  return '#15803D';
}

function sign(n: number): string {
  return (n >= 0 ? '+' : '') + n.toFixed(1);
}

function calcDuracion(start: string, end: string): number {
  const s = parseInt(start.split(':')[0], 10);
  const e = parseInt(end.split(':')[0], 10);
  let h = e - s;
  if (h <= 0) h += 24;
  return h;
}

async function sharePatientList(patients: Patient[]) {
  try {
    const json  = JSON.stringify(patients.length === 1 ? patients[0] : patients, null, 2);
    const label = patients.length === 1 ? `cama_${patients[0].cama}` : `${patients.length}_pacientes`;
    const path  = `${FileSystem.cacheDirectory}bh_${label}.json`;
    await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: `BH ${label}` });
    } else {
      Alert.alert('No disponible', 'Compartir no está disponible en este dispositivo.');
    }
  } catch { Alert.alert('Error', 'No se pudo compartir.'); }
}

// ─── HourSelector ────────────────────────────────────────────────────────────

function HourSelector({
  label, value, onChange, timeFormat,
}: {
  label: string;
  value: string;
  onChange: (h: string) => void;
  timeFormat: '12h' | '24h';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.hourRow}>
          {Array.from({ length: 24 }, (_, i) => {
            const h24      = `${String(i).padStart(2, '0')}:00`;
            const selected = value === h24;
            return (
              <TouchableOpacity
                key={i}
                onPress={() => onChange(h24)}
                style={[styles.hourChip, selected && styles.hourChipSelected]}
              >
                <Text style={[styles.hourChipText, selected && styles.hourChipTextSel]}>
                  {timeFormat === '24h'
                    ? String(i).padStart(2, '0')
                    : `${i % 12 || 12}${i < 12 ? 'a' : 'p'}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Modal agregar paciente ───────────────────────────────────────────────────

function AddPatientModal({
  visible, onClose, onSave, timeFormat, hospitalId,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (p: Patient) => void;
  timeFormat: '12h' | '24h';
  hospitalId: string;
}) {
  const [cama, setCama]         = useState('');
  const [nombre, setNombre]     = useState('');
  const [edad, setEdad]         = useState('');
  const [registro, setRegistro] = useState('');
  const [peso, setPeso]         = useState('');
  const [talla, setTalla]       = useState('');
  const [startHora, setStart]   = useState('07:00');
  const [endHora, setEnd]       = useState('07:00');

  function reset() {
    setCama(''); setNombre(''); setEdad(''); setRegistro('');
    setPeso(''); setTalla(''); setStart('07:00'); setEnd('07:00');
  }

  function handleSave() {
    if (!cama.trim()) {
      Alert.alert('Campo requerido', 'El N° de cama es obligatorio.');
      return;
    }
    if (!peso || isNaN(Number(peso)) || Number(peso) <= 0) {
      Alert.alert('Campo requerido', 'El peso es obligatorio.');
      return;
    }
    const p  = Number(peso);
    const t  = Number(talla);
    const sc = calcSC(p);
    const patient: Patient = {
      id: Date.now().toString(),
      cama: cama.trim(),
      nombre: nombre.trim() || undefined,
      edad: edad ? Number(edad) : undefined,
      registro: registro.trim() || undefined,
      peso: p,
      talla: talla ? t : undefined,
      sc,
      startHora,
      endHora,
      hospitalId,
      createdAt: new Date().toISOString(),
      rows: buildEmptyRows(startHora, endHora),
    };
    onSave(patient);
    reset();
    onClose();
  }

  const dur = calcDuracion(startHora, endHora);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Nuevo paciente</Text>
          <Text style={styles.modalHospital}>{getHospital(hospitalId).name}</Text>

          <Field label="N° Cama *"          value={cama}     onChange={setCama}     keyboardType="default" />
          <Field label="Nombre / Iniciales"  value={nombre}   onChange={setNombre} />
          <Field label="Edad"                value={edad}     onChange={setEdad}     keyboardType="numeric" />
          <Field label="N° Registro"         value={registro} onChange={setRegistro} keyboardType="default" />
          <Field label="Peso (kg) *"         value={peso}     onChange={setPeso}     keyboardType="decimal-pad" />
          <Field label="Talla (cm)"          value={talla}    onChange={setTalla}    keyboardType="decimal-pad" />

          {peso ? (
            <Text style={styles.scPreview}>
              SC ≈ {calcSC(Number(peso)).toFixed(2)} m²
            </Text>
          ) : null}

          <HourSelector label="Inicio del balance" value={startHora} onChange={setStart} timeFormat={timeFormat} />
          <HourSelector label="Fin del balance"    value={endHora}   onChange={setEnd}   timeFormat={timeFormat} />

          <Text style={styles.durPreview}>
            Duración: {dur}h · {Math.ceil(dur / 4)} bloques de 4h
          </Text>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={() => { reset(); onClose(); }}>
              <Text style={styles.btnCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
              <Text style={styles.btnSaveText}>Guardar</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({
  label, value, onChange, keyboardType = 'default',
}: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize="characters"
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

// ─── Card de paciente ─────────────────────────────────────────────────────────

function PatientCard({
  patient, onPress, onLongPress, onDelete, timeFormat, selected, multiSelectMode,
}: {
  patient: Patient;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  timeFormat: '12h' | '24h';
  selected: boolean;
  multiSelectMode: boolean;
}) {
  const blocks     = calcBlocks(patient.rows, patient.peso ?? 70, patient.sc ?? 1.7);
  const bh         = calcBHTotal(blocks);
  const dh         = calcDHTotal(blocks);
  const startLabel = formatHora(patient.startHora ?? '07:00', timeFormat);
  const endLabel   = formatHora(patient.endHora   ?? '07:00', timeFormat);

  function showMenu() {
    Alert.alert(`Cama ${patient.cama}`, 'Selecciona una acción', [
      { text: '↑ Compartir JSON', onPress: () => sharePatientList([patient]) },
      { text: '🗑 Eliminar',       onPress: onDelete, style: 'destructive' },
      { text: 'Cancelar',          style: 'cancel' },
    ]);
  }

  return (
    <TouchableOpacity
      style={[styles.card, selected && styles.cardSelected]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
      delayLongPress={400}
    >
      {multiSelectMode && (
        <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
          {selected && <Text style={styles.checkboxMark}>✓</Text>}
        </View>
      )}

      <View style={styles.cardLeft}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardCama}>Cama {patient.cama}</Text>
          {patient.createdAt ? (
            <Text style={styles.cardDate}>{formatDate(patient.createdAt)}</Text>
          ) : null}
        </View>
        {patient.nombre ? <Text style={styles.cardNombre}>{patient.nombre}</Text> : null}
        <Text style={styles.cardMeta}>
          {[
            patient.edad ? `${patient.edad} a` : null,
            patient.peso ? `${patient.peso} kg` : null,
            patient.sc   ? `SC ${patient.sc} m²` : null,
          ].filter(Boolean).join(' · ')}
        </Text>
        <Text style={styles.cardHorario}>{startLabel} → {endLabel}</Text>
      </View>

      <View style={styles.cardRight}>
        <Text style={[styles.cardBH, { color: bhColor(bh) }]}>{sign(bh)} mL</Text>
        <Text style={styles.cardMetric}>BH</Text>
        <Text style={styles.cardDH}>{dh.toFixed(2)}</Text>
        <Text style={styles.cardMetric}>mL/kg/h DH</Text>
      </View>

      {!multiSelectMode && (
        <TouchableOpacity
          style={styles.cardMenu}
          onPress={showMenu}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.cardMenuText}>⋯</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PatientList() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [patients, setPatients]       = useState<Patient[]>([]);
  const [showAdd, setShowAdd]         = useState(false);
  const [settings, setSettings]       = useState<Settings>({ timeFormat: '24h', hospitalId: 'HNSJDDSM' });
  const [multiSelectMode, setMulti]   = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const hospitals = getAllHospitals();

  useFocusEffect(
    useCallback(() => {
      getPatients().then(setPatients);
      getSettings().then(setSettings);
      setMulti(false);
      setSelectedIds([]);
    }, [])
  );

  async function handleSave(p: Patient) {
    await savePatient(p);
    setPatients(await getPatients());
  }

  async function handleDelete(id: string) {
    Alert.alert('Eliminar paciente', '¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => { await deletePatient(id); setPatients(await getPatients()); },
      },
    ]);
  }

  async function handleImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled) return;
      const raw  = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const data = JSON.parse(raw);
      const list: Patient[] = Array.isArray(data) ? data : [data];
      for (const p of list) {
        if (!p.id || !p.cama || !Array.isArray(p.rows)) {
          Alert.alert('Error', 'Formato de archivo incorrecto.'); return;
        }
        await importPatient(p);
      }
      setPatients(await getPatients());
      const msg = list.length === 1 ? `Cama ${list[0].cama} importada.` : `${list.length} pacientes importados.`;
      Alert.alert('Importado', msg);
    } catch { Alert.alert('Error', 'No se pudo importar.'); }
  }

  async function toggleFormat() {
    const next    = settings.timeFormat === '24h' ? '12h' : '24h';
    const updated = await saveSettings({ timeFormat: next });
    setSettings(updated);
  }

  function selectHospital() {
    if (hospitals.length === 1) {
      Alert.alert('Hospital activo', hospitals[0].name);
      return;
    }
    Alert.alert('Seleccionar hospital', 'Los nuevos registros usarán este formato', [
      ...hospitals.map((h) => ({
        text: (h.id === settings.hospitalId ? '✓ ' : '') + h.name,
        onPress: async () => {
          const updated = await saveSettings({ hospitalId: h.id });
          setSettings(updated);
        },
      })),
      { text: 'Cancelar', style: 'cancel' },
    ]);
  }

  // ─── Multi-select ──────────────────────────────────────────────────────────

  function enterMultiSelect(id: string) {
    setMulti(true);
    setSelectedIds([id]);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function exitMultiSelect() {
    setMulti(false);
    setSelectedIds([]);
  }

  async function bulkDelete() {
    const n = selectedIds.length;
    Alert.alert(`Eliminar ${n} paciente${n !== 1 ? 's' : ''}`, '¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          for (const id of selectedIds) await deletePatient(id);
          setPatients(await getPatients());
          exitMultiSelect();
        },
      },
    ]);
  }

  async function bulkShare() {
    const selected = patients.filter((p) => selectedIds.includes(p.id));
    await sharePatientList(selected);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      {/* Espacio para status bar */}
      <View style={{ height: insets.top, backgroundColor: '#fff' }} />

      {/* Barra superior */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Balance Hídrico</Text>
        <TouchableOpacity style={styles.hospitalBtn} onPress={selectHospital}>
          <Text style={styles.hospitalBtnText}>
            {getHospital(settings.hospitalId).abbreviation} ▾
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.formatBtn} onPress={toggleFormat}>
          <Text style={styles.formatBtnText}>{settings.timeFormat}</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={patients}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No hay pacientes.</Text>
            <Text style={styles.emptySubtext}>Toca "+" para agregar uno.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PatientCard
            patient={item}
            onPress={() =>
              multiSelectMode ? toggleSelect(item.id) : router.push(`/patient/${item.id}`)
            }
            onLongPress={() =>
              multiSelectMode ? toggleSelect(item.id) : enterMultiSelect(item.id)
            }
            onDelete={() => handleDelete(item.id)}
            timeFormat={settings.timeFormat}
            selected={selectedIds.includes(item.id)}
            multiSelectMode={multiSelectMode}
          />
        )}
      />

      {/* Barra de selección múltiple */}
      {multiSelectMode ? (
        <View style={styles.multiBar}>
          <TouchableOpacity style={styles.multiBarCancel} onPress={exitMultiSelect}>
            <Text style={styles.multiBarCancelText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.multiBarCount}>
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </Text>
          <TouchableOpacity
            style={[styles.multiBarBtn, styles.multiBarShare, selectedIds.length === 0 && styles.multiBarDisabled]}
            onPress={bulkShare}
            disabled={selectedIds.length === 0}
          >
            <Text style={styles.multiBarBtnText}>↑ Compartir</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.multiBarBtn, styles.multiBarDelete, selectedIds.length === 0 && styles.multiBarDisabled]}
            onPress={bulkDelete}
            disabled={selectedIds.length === 0}
          >
            <Text style={styles.multiBarBtnText}>🗑 Eliminar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <TouchableOpacity style={styles.fabImport} onPress={handleImport}>
            <Text style={styles.fabImportText}>↓ JSON</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      <AddPatientModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
        timeFormat={settings.timeFormat}
        hospitalId={settings.hospitalId}
      />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F3F4F6' },

  topBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1E3A5F', gap: 8,
  },
  topBarTitle:    { flex: 1, color: '#fff', fontSize: 18, fontWeight: '800' },
  hospitalBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  hospitalBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  formatBtn: {
    backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  formatBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  list: { padding: 12, gap: 10, paddingBottom: 100 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardSelected: {
    borderWidth: 2, borderColor: '#2563EB', backgroundColor: '#EFF6FF',
  },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLeft:    { flex: 1 },
  cardCama:    { fontSize: 17, fontWeight: '700', color: '#111827' },
  cardDate:    { fontSize: 11, color: '#9CA3AF', fontVariant: ['tabular-nums'] },
  cardNombre:  { fontSize: 13, color: '#6B7280', marginTop: 2 },
  cardMeta:    { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  cardHorario: { fontSize: 11, color: '#6B7280', marginTop: 3 },
  cardRight:   { alignItems: 'flex-end', marginRight: 8 },
  cardBH:      { fontSize: 20, fontWeight: '800' },
  cardDH:      { fontSize: 16, fontWeight: '700', color: '#2563EB', marginTop: 4 },
  cardMetric:  { fontSize: 10, color: '#9CA3AF' },
  cardMenu:     { paddingHorizontal: 8, paddingVertical: 4, justifyContent: 'center' },
  cardMenuText: { fontSize: 22, color: '#6B7280', lineHeight: 26 },

  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12,
  },
  checkboxSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkboxMark:     { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },

  empty:        { flex: 1, alignItems: 'center', marginTop: 80 },
  emptyText:    { fontSize: 17, fontWeight: '600', color: '#6B7280' },
  emptySubtext: { fontSize: 14, color: '#9CA3AF', marginTop: 6 },

  fab: {
    position: 'absolute', right: 20, bottom: 28, width: 56, height: 56,
    borderRadius: 28, backgroundColor: '#2563EB',
    justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6,
  },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 30 },
  fabImport: {
    position: 'absolute', right: 84, bottom: 36,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#059669',
    elevation: 4,
  },
  fabImportText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Multi-select bar
  multiBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#1E3A5F',
  },
  multiBarCancel: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  multiBarCancelText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  multiBarCount: { flex: 1, color: '#93C5FD', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  multiBarBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  multiBarBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  multiBarShare:    { backgroundColor: '#059669' },
  multiBarDelete:   { backgroundColor: '#DC2626' },
  multiBarDisabled: { opacity: 0.4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalTitle:    { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 2 },
  modalHospital: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  scPreview:     { fontSize: 13, color: '#2563EB', textAlign: 'right', marginBottom: 4 },
  durPreview:    { fontSize: 13, color: '#059669', textAlign: 'center', marginVertical: 8, fontWeight: '600' },
  modalActions:  { flexDirection: 'row', gap: 10, marginTop: 8 },
  btnCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center',
  },
  btnCancelText: { color: '#6B7280', fontWeight: '600' },
  btnSave:       { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center' },
  btnSaveText:   { color: '#fff', fontWeight: '700' },

  field:      { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  fieldInput: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827', backgroundColor: '#F9FAFB',
  },
  hourRow: { flexDirection: 'row', gap: 6, paddingVertical: 4 },
  hourChip: {
    width: 40, height: 32, borderRadius: 6, backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center',
  },
  hourChipSelected:  { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  hourChipText:      { fontSize: 11, fontWeight: '600', color: '#374151' },
  hourChipTextSel:   { color: '#fff' },
});
