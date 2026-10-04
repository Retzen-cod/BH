import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView,
  useColorScheme, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as NavigationBar from 'expo-navigation-bar';
import * as Linking from 'expo-linking';
import { useShareIntentContext } from 'expo-share-intent';
import JSZip from 'jszip';
import { v4 as uuidv4 } from 'uuid';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Patient } from '../src/types';
import { getPatients, savePatient, deletePatient, importPatient } from '../src/utils/storage';
import { consumePendingImport } from '../src/utils/pendingImport';
import { buildEmptyRows, calcBlocks, calcBHTotal, calcDHTotal, calcSC, scEtiqueta, scDetalle } from '../src/utils/calculations';
import { getSettings, saveSettings, formatHora, formatDate, Settings } from '../src/utils/settings';
import { getAllHospitalsAsync, findTable } from '../src/hospitals';
import { HospitalConfig, TableConfig, FieldMode, PatientFieldsDef } from '../src/types/hospital';
import { saveCustomHospital, saveCustomTables, normalizeHospital } from '../src/utils/hospitalStorage';
import { sharePatients } from '../src/utils/share';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type ListItem =
  | { type: 'header'; label: string; dateKey: string }
  | { type: 'patient'; patient: Patient };

const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function localDateKey(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function dateKey(iso: string): string {
  return iso ? localDateKey(new Date(iso)) : 'sin-fecha';
}

function dateLabel(key: string): string {
  const now       = new Date();
  const today     = localDateKey(now);
  const yesterday = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  if (key === today)     return 'Hoy';
  if (key === yesterday) return 'Ayer';
  const [y, m, d] = key.split('-');
  return `${parseInt(d)} de ${MONTHS[parseInt(m) - 1]} de ${y}`;
}

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

/**
 * Parsea un archivo .bhd.
 * Soporta formato v2 { v, patients, hospitals } y el formato antiguo Patient | Patient[].
 */
function parseBHD(raw: string): { patients: Patient[]; hospitals: any[] } {
  const data = JSON.parse(raw);
  if (!data || data.v !== 2 || !Array.isArray(data.patients)) {
    throw new Error('Formato .bhd no reconocido. Se requiere formato v2.');
  }
  return {
    patients:  data.patients  as Patient[],
    hospitals: Array.isArray(data.hospitals) ? data.hospitals : [], // crudos: pueden venir sin `tables`
  };
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

// ─── Modal selector de hospital (con buscador) ───────────────────────────────

function HospitalPickerModal({
  visible, hospitals, selectedId, selectedTableId, onSelect, onClose,
}: {
  visible: boolean;
  hospitals: HospitalConfig[];
  selectedId: string;
  selectedTableId?: string;
  onSelect: (h: HospitalConfig, t: TableConfig) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();
  const filtered = hospitals.filter((h) =>
    h.name.toLowerCase().includes(q) ||
    h.abbreviation.toLowerCase().includes(q) ||
    h.tables.some(t => t.name.toLowerCase().includes(q))
  );

  function pick(h: HospitalConfig, t: TableConfig) {
    onSelect(h, t); onClose(); setQuery('');
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.pickerSheet}>
          <Text style={styles.pickerTitle}>Seleccionar hospital y tabla</Text>

          <TextInput
            style={styles.pickerSearch}
            placeholder="Buscar hospital o tabla..."
            placeholderTextColor="#9CA3AF"
            value={query}
            onChangeText={setQuery}
            clearButtonMode="while-editing"
          />

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {filtered.length === 0 && (
              <Text style={styles.pickerEmpty}>Sin resultados</Text>
            )}
            {filtered.map((h) => {
              const selTable = h.id === selectedId ? findTable(h, selectedTableId) : undefined;

              // Hospital de una sola tabla: una fila, como antes
              if (h.tables.length === 1) {
                const sel = !!selTable;
                return (
                  <TouchableOpacity
                    key={h.id}
                    style={[styles.pickerItem, sel && styles.pickerItemSelected]}
                    onPress={() => pick(h, h.tables[0])}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemName, sel && { color: '#2563EB' }]}>{h.name}</Text>
                      <Text style={styles.pickerItemMeta}>{h.abbreviation} · {h.tables[0].name}</Text>
                    </View>
                    {sel && <Text style={styles.pickerCheck}>✓</Text>}
                  </TouchableOpacity>
                );
              }

              // Varias tablas: encabezado del hospital + una fila por tabla (texto completo)
              return (
                <View key={h.id}>
                  <View style={styles.pickerHospitalHeader}>
                    <Text style={styles.pickerItemName}>{h.name}</Text>
                    <Text style={styles.pickerItemMeta}>{h.abbreviation}</Text>
                  </View>
                  {h.tables.map((t) => {
                    const sel = selTable?.id === t.id;
                    return (
                      <TouchableOpacity
                        key={t.id}
                        style={[styles.pickerItem, styles.pickerTableItem, sel && styles.pickerItemSelected]}
                        onPress={() => pick(h, t)}
                      >
                        <Text style={[styles.pickerTableName, sel && { color: '#2563EB' }]}>{t.name}</Text>
                        {sel && <Text style={styles.pickerCheck}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.pickerCancel} onPress={() => { onClose(); setQuery(''); }}>
            <Text style={styles.pickerCancelText}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Modal agregar paciente ───────────────────────────────────────────────────

/** Devuelve el modo de un campo según la config del hospital (fallback: 'optional') */
function fieldMode(fields: PatientFieldsDef | undefined, key: keyof PatientFieldsDef): FieldMode {
  return fields?.[key] ?? 'optional';
}

function AddPatientModal({
  visible, onClose, onSave, timeFormat, defaultHospitalId, defaultTableId, allHospitals,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (p: Patient) => Promise<void>;
  timeFormat: '12h' | '24h';
  defaultHospitalId: string;
  defaultTableId?: string;
  allHospitals: HospitalConfig[];
}) {
  const [cama, setCama]         = useState('');
  const [nombre, setNombre]     = useState('');
  const [edad, setEdad]         = useState('');
  const [registro, setRegistro] = useState('');
  const [peso, setPeso]         = useState('');
  const [talla, setTalla]       = useState('');
  const [startHora, setStart]   = useState('07:00');
  // Hospital y tabla vienen del selector de la barra superior (settings)
  const selHospital = allHospitals.find(h => h.id === defaultHospitalId) ?? allHospitals[0];
  const selTable    = selHospital ? findTable(selHospital, defaultTableId) : undefined;
  const pf = selTable?.patientFields; // atajo

  function reset() {
    setCama(''); setNombre(''); setEdad(''); setRegistro('');
    setPeso(''); setTalla(''); setStart('07:00');
  }

  async function handleSave() {
    // ── Validaciones fijas ──
    if (!cama.trim()) {
      Alert.alert('Campo requerido', 'El N° de cama es obligatorio.'); return;
    }
    if (!peso || isNaN(Number(peso)) || Number(peso) <= 0) {
      Alert.alert('Campo requerido', 'El peso es obligatorio.'); return;
    }
    // ── Validaciones según hospital ──
    if (fieldMode(pf, 'nombre')   === 'required' && !nombre.trim()) {
      Alert.alert('Campo requerido', 'El nombre es obligatorio para este hospital.'); return;
    }
    if (fieldMode(pf, 'edad')     === 'required' && !edad) {
      Alert.alert('Campo requerido', 'La edad es obligatoria para este hospital.'); return;
    }
    if (fieldMode(pf, 'registro') === 'required' && !registro.trim()) {
      Alert.alert('Campo requerido', 'El N° de registro es obligatorio para este hospital.'); return;
    }
    if (fieldMode(pf, 'talla')    === 'required' && !talla) {
      Alert.alert('Campo requerido', 'La talla es obligatoria para este hospital.'); return;
    }

    try {
      const p  = Number(peso);
      const t  = Number(talla);
      const sc = calcSC(p, selTable, talla ? t : undefined);
      const patient: Patient = {
        id: uuidv4(),
        cama: cama.trim(),
        nombre: nombre.trim() || undefined,
        edad: edad ? Number(edad) : undefined,
        registro: registro.trim() || undefined,
        peso: p,
        talla: talla ? t : undefined,
        sc,
        startHora,
        endHora: startHora,
        hospitalId: selHospital?.id ?? defaultHospitalId,
        tableId:    selTable?.id,
        createdAt: new Date().toISOString(),
        rows: buildEmptyRows(startHora, startHora),
      };
      await onSave(patient);
      reset();
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert('Error al guardar', msg);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Nuevo paciente</Text>

          {/* ── Hospital · tabla (se cambian desde el selector de la barra superior) ── */}
          <Text style={styles.modalHospital}>
            {selHospital?.name}{selTable && selHospital && selHospital.tables.length > 1 ? ` · ${selTable.name}` : ''}
          </Text>

          {/* ── Campos fijos (siempre obligatorios) ── */}
          <Field label="N° Cama *" value={cama} onChange={setCama} />
          <Field label="Peso (kg) *" value={peso} onChange={setPeso} keyboardType="decimal-pad" />

          {peso ? (
            <Text style={styles.scPreview}>
              SC ≈ {calcSC(Number(peso), selTable, Number(talla) || undefined).toFixed(2)} m²
              {scDetalle(Number(peso), selTable, Number(talla) || undefined) ? ` · ${scDetalle(Number(peso), selTable, Number(talla) || undefined)}` : ''}
            </Text>
          ) : null}

          {/* ── Campos opcionales según el hospital ── */}
          {fieldMode(pf, 'nombre') !== 'hidden' && (
            <Field
              label={`Nombre / Iniciales${fieldMode(pf, 'nombre') === 'required' ? ' *' : ''}`}
              value={nombre}
              onChange={setNombre}
            />
          )}
          {fieldMode(pf, 'edad') !== 'hidden' && (
            <Field
              label={`Edad${fieldMode(pf, 'edad') === 'required' ? ' *' : ''}`}
              value={edad}
              onChange={setEdad}
              keyboardType="numeric"
            />
          )}
          {fieldMode(pf, 'registro') !== 'hidden' && (
            <Field
              label={`N° Registro${fieldMode(pf, 'registro') === 'required' ? ' *' : ''}`}
              value={registro}
              onChange={setRegistro}
            />
          )}
          {fieldMode(pf, 'talla') !== 'hidden' && (
            <Field
              label={`Talla (cm)${fieldMode(pf, 'talla') === 'required' ? ' *' : ''}`}
              value={talla}
              onChange={setTalla}
              keyboardType="decimal-pad"
            />
          )}

          <HourSelector label="Inicio del balance (24h fijo)" value={startHora} onChange={setStart} timeFormat={timeFormat} />

          <Text style={styles.durPreview}>
            24h · 6 bloques de 4h · Fin: {timeFormat === '24h'
              ? startHora
              : (() => { const h = parseInt(startHora, 10); return `${h % 12 || 12}:00 ${h < 12 ? 'AM' : 'PM'}`; })()}
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

const CARD_FIELD_FORMATTERS: Record<string, (p: Patient) => string | null> = {
  nombre:   (p) => p.nombre   ?? null,
  edad:     (p) => p.edad     != null ? `${p.edad} a`       : null,
  peso:     (p) => p.peso     != null ? `${p.peso} kg`      : null,
  sc:       (p) => p.sc       != null ? `SC ${p.sc} m²`     : null,
  registro: (p) => p.registro  ? `#${p.registro}`           : null,
  talla:    (p) => p.talla    != null ? `${p.talla} cm`     : null,
};

const DEFAULT_CARD_PREVIEW = ['edad', 'peso', 'sc'];

function PatientCard({
  patient, table, onPress, onLongPress, onDelete, onShare, onEdit,
  timeFormat, selected, multiSelectMode,
}: {
  patient: Patient;
  table: TableConfig | undefined;
  onPress: () => void;
  onLongPress: () => void;
  onDelete: () => void;
  onShare: () => void;
  onEdit: () => void;
  timeFormat: '12h' | '24h';
  selected: boolean;
  multiSelectMode: boolean;
}) {
  // SC siempre derivada del peso con la regla de la tabla (el valor guardado puede ser de otra fórmula)
  const peso  = patient.peso ?? 70;
  const sc    = calcSC(peso, table, patient.talla);
  const scTag = scEtiqueta(peso, table);
  // Sin la tabla no se sabe qué columnas entran al balance → se muestra "—".
  const enabledBlocks = table
    ? calcBlocks(patient.rows, peso, sc, table)
        .filter(b => !(patient.disabledBlocks ?? []).includes(b.blockIndex))
    : [];
  const bh         = calcBHTotal(enabledBlocks);
  const dh         = calcDHTotal(enabledBlocks);
  const startLabel = formatHora(patient.startHora ?? '07:00', timeFormat);
  const endLabel   = formatHora(patient.endHora   ?? '07:00', timeFormat);

  const previewKeys = table?.cardPreview ?? DEFAULT_CARD_PREVIEW;
  const layout      = table?.card ?? {};
  const metaItems   = previewKeys
    .map(key => CARD_FIELD_FORMATTERS[key]?.({ ...patient, sc }) ?? null)
    .filter(Boolean) as string[];

  function showMenu() {
    Alert.alert(`Cama ${patient.cama}`, 'Selecciona una acción', [
      { text: '✎ Editar',    onPress: onEdit },
      { text: '↑ Compartir', onPress: onShare },
      { text: '🗑 Eliminar',  onPress: onDelete, style: 'destructive' },
      { text: 'Cancelar',    style: 'cancel' },
    ], { cancelable: true });
  }

  return (
    <TouchableOpacity
      style={[styles.card, layout.minHeight != null && { minHeight: layout.minHeight }, selected && styles.cardSelected]}
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
          {scTag ? <Text style={styles.cardTag}>{scTag}</Text> : null}
          {patient.createdAt ? (
            <Text style={styles.cardDate}>{formatDate(patient.createdAt)}</Text>
          ) : null}
        </View>
        {patient.nombre ? <Text style={styles.cardNombre}>{patient.nombre}</Text> : null}
        {metaItems.length > 0 && (
          <Text style={styles.cardMeta} numberOfLines={layout.metaLines}>{metaItems.join(' · ')}</Text>
        )}
        <Text style={styles.cardHorario}>{startLabel} → {endLabel}</Text>
      </View>

      <View style={[styles.cardRight, layout.metricsWidth != null && { width: layout.metricsWidth }]}>
        <Text style={[styles.cardBH, { color: bhColor(bh) }]} numberOfLines={1} adjustsFontSizeToFit>{table ? `${sign(bh)} mL` : '—'}</Text>
        <Text style={styles.cardMetric}>BH</Text>
        <Text style={styles.cardDH}>{table ? dh.toFixed(2) : '—'}</Text>
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

// ─── Modal editar paciente ────────────────────────────────────────────────────

function EditPatientModal({
  visible, patient, onClose, onSave, allHospitals, timeFormat,
}: {
  visible: boolean;
  patient: Patient | null;
  onClose: () => void;
  onSave: (p: Patient) => void;
  allHospitals: HospitalConfig[];
  timeFormat: '12h' | '24h';
}) {
  const [cama,      setCama]      = useState('');
  const [nombre,    setNombre]    = useState('');
  const [edad,      setEdad]      = useState('');
  const [registro,  setRegistro]  = useState('');
  const [peso,      setPeso]      = useState('');
  const [talla,     setTalla]     = useState('');
  const [startHora, setStartHora] = useState('07:00');

  React.useEffect(() => {
    if (!patient) return;
    setCama(patient.cama);
    setNombre(patient.nombre    ?? '');
    setEdad(patient.edad        != null ? String(patient.edad)  : '');
    setRegistro(patient.registro ?? '');
    setPeso(patient.peso        != null ? String(patient.peso)  : '');
    setTalla(patient.talla      != null ? String(patient.talla) : '');
    setStartHora(patient.startHora ?? '07:00');
  }, [patient]);

  const hospital = allHospitals.find(h => h.id === patient?.hospitalId);
  const table    = hospital ? findTable(hospital, patient?.tableId) : undefined;
  const pf       = table?.patientFields;

  function handleSave() {
    if (!patient) return;
    if (!cama.trim()) {
      Alert.alert('Campo requerido', 'El N° de cama es obligatorio.'); return;
    }
    if (!peso || isNaN(Number(peso)) || Number(peso) <= 0) {
      Alert.alert('Campo requerido', 'El peso es obligatorio.'); return;
    }
    const p = Number(peso);
    const t = Number(talla);
    onSave({
      ...patient,
      cama:      cama.trim(),
      nombre:    nombre.trim()   || undefined,
      edad:      edad             ? Number(edad) : undefined,
      registro:  registro.trim() || undefined,
      peso:      p,
      talla:     talla            ? t : undefined,
      sc:        calcSC(p, table, talla ? t : undefined),
      startHora,
      endHora:   startHora,
    });
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.modalBox} keyboardShouldPersistTaps="handled">
          <Text style={styles.modalTitle}>Editar expediente</Text>
          {hospital && (
            <Text style={styles.modalHospital}>{hospital.name} · {table?.name}</Text>
          )}

          <Field label="N° Cama *"  value={cama}  onChange={setCama} />
          <Field label="Peso (kg) *" value={peso} onChange={setPeso} keyboardType="decimal-pad" />

          {peso ? (
            <Text style={styles.scPreview}>
              SC ≈ {calcSC(Number(peso), table, Number(talla) || undefined).toFixed(2)} m²
              {scDetalle(Number(peso), table, Number(talla) || undefined) ? ` · ${scDetalle(Number(peso), table, Number(talla) || undefined)}` : ''}
            </Text>
          ) : null}

          {fieldMode(pf, 'nombre') !== 'hidden' && (
            <Field label="Nombre / Iniciales" value={nombre} onChange={setNombre} />
          )}
          {fieldMode(pf, 'edad') !== 'hidden' && (
            <Field label="Edad" value={edad} onChange={setEdad} keyboardType="numeric" />
          )}
          {fieldMode(pf, 'registro') !== 'hidden' && (
            <Field label="N° Registro" value={registro} onChange={setRegistro} />
          )}
          {fieldMode(pf, 'talla') !== 'hidden' && (
            <Field label="Talla (cm)" value={talla} onChange={setTalla} keyboardType="decimal-pad" />
          )}

          <HourSelector label="Inicio del balance (24h fijo)" value={startHora} onChange={setStartHora} timeFormat={timeFormat} />

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
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

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PatientList() {
  const router      = useRouter();
  const insets      = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const isDark      = colorScheme === 'dark';
  const statusBg    = isDark ? '#111827' : '#ffffff';

  const [patients, setPatients]               = useState<Patient[]>([]);
  const [showAdd, setShowAdd]                 = useState(false);
  const [editingPatient, setEditingPatient]   = useState<Patient | null>(null);
  const [settings, setSettings]               = useState<Settings>({ timeFormat: '24h', hospitalId: 'HNSJDDSM' });
  const [multiSelectMode, setMulti]           = useState(false);
  const [selectedIds, setSelectedIds]         = useState<string[]>([]);
  const [allHospitals, setAllHospitals]       = useState<HospitalConfig[]>([]);
  const [showHospitalPicker, setShowHospitalPicker] = useState(false);
  const [searchQuery, setSearchQuery]         = useState('');
  const [importStatus, setImportStatus]       = useState<'idle' | 'importing'>('idle');

  const loadData = useCallback(async () => {
    const [pts, hosp] = await Promise.all([getPatients(), getAllHospitalsAsync()]);
    setPatients(pts);
    setAllHospitals(hosp);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      getSettings().then(setSettings);
      setMulti(false);
      setSelectedIds([]);
      NavigationBar.setVisibilityAsync('hidden');
    }, [loadData])
  );

  // ─── Importar hospitales + pacientes desde un .bhd ────────────────────────

  async function importBHDData(raw: string) {
    const { patients: list, hospitals: incoming } = parseBHD(raw);

    // Validar que hay pacientes
    if (!list.length || !list[0].id || !list[0].cama || !Array.isArray(list[0].rows)) {
      Alert.alert('Error', 'Formato de archivo incorrecto.');
      return;
    }

    // Importar hospitales y tablas que no existan aún en el dispositivo.
    // Las tablas existentes nunca se sobrescriben: cada tabla es independiente.
    const currentHospitals = await getAllHospitalsAsync();
    for (const raw of incoming) {
      const isLegacy = !Array.isArray(raw?.tables); // .bhd de versiones sin tablas
      const h        = normalizeHospital(raw);
      const existing = currentHospitals.find(e => e.id === h.id);
      if (!existing) {
        await saveCustomHospital(h);
      } else if (!isLegacy) {
        const missing = h.tables.filter(t => !existing.tables.some(e => e.id === t.id));
        if (missing.length) await saveCustomTables(existing, missing);
      }
      // legacy + hospital existente: sus pacientes (sin tableId) usan la primera tabla local
    }

    // Importar pacientes — con resolución de conflictos por ID
    const existing = await getPatients();
    let imported = 0;

    for (const p of list) {
      if (!p.id || !p.cama || !Array.isArray(p.rows)) continue;

      const conflict = existing.find(e => e.id === p.id);
      if (conflict) {
        const action = await new Promise<'overwrite' | 'keep_both' | 'skip'>((resolve) => {
          const existingDate = formatDate(conflict.createdAt);
          const incomingDate = formatDate(p.createdAt);
          Alert.alert(
            'Conflicto de expediente',
            `Cama ${p.cama}${p.nombre ? ` — ${p.nombre}` : ''} ya existe en este dispositivo.\n\nExistente: ${existingDate}\nEntrante:  ${incomingDate}`,
            [
              { text: 'Sobreescribir',      onPress: () => resolve('overwrite')  },
              { text: 'Conservar ambos',     onPress: () => resolve('keep_both')  },
              { text: 'Conservar existente', onPress: () => resolve('skip'), style: 'cancel' },
            ],
            { cancelable: false },
          );
        });

        if (action === 'overwrite') {
          await importPatient(p);
          imported++;
        } else if (action === 'keep_both') {
          await importPatient({ ...p, id: uuidv4() });
          imported++;
        }
        // 'skip': no hacer nada
      } else {
        await importPatient(p);
        imported++;
      }
    }

    await loadData();

    const msg = imported === 0
      ? 'No se importaron expedientes.'
      : imported === 1
        ? `Cama ${list[0].cama} importada.`
        : `${imported} pacientes importados.`;
    Alert.alert('Importado', msg);
  }

  async function importFromUrl(url: string) {
    if (!url || (!url.startsWith('content://') && !url.startsWith('file://'))) return;
    setImportStatus('importing');
    try {
      // content:// URIs de otros apps no son legibles directamente; copiar al cache primero
      let localUrl = url;
      if (url.startsWith('content://')) {
        const dest = `${FileSystem.cacheDirectory}import_${Date.now()}.bhd`;
        await FileSystem.copyAsync({ from: url, to: dest });
        localUrl = dest;
      }

      // Intentar como JSON plano primero (formato legacy)
      try {
        const raw = await FileSystem.readAsStringAsync(localUrl, { encoding: FileSystem.EncodingType.UTF8 });
        JSON.parse(raw);
        await importBHDData(raw);
        return;
      } catch {}

      // Intentar como zip (.bhd nuevo formato)
      const base64 = await FileSystem.readAsStringAsync(localUrl, { encoding: FileSystem.EncodingType.Base64 });
      const zip = await JSZip.loadAsync(base64, { base64: true });

      const hospitalsFile = zip.file('hospitals.json');
      const hospitals: any[] = hospitalsFile
        ? JSON.parse(await hospitalsFile.async('string'))
        : [];

      const patients: Patient[] = [];
      for (const filename of Object.keys(zip.files)) {
        if (filename === 'hospitals.json' || zip.files[filename].dir) continue;
        try {
          const content = await zip.files[filename].async('string');
          patients.push(JSON.parse(content) as Patient);
        } catch {}
      }

      if (patients.length > 0) {
        await importBHDData(JSON.stringify({ v: 2, patients, hospitals }));
      } else {
        Alert.alert('Error', 'El archivo no contiene expedientes válidos.');
      }
    } catch {
      Alert.alert('Error', 'No se pudo importar el archivo.');
    } finally {
      setImportStatus('idle');
    }
  }

  // Al abrir un .bhd desde WhatsApp (ACTION_VIEW)
  React.useEffect(() => {
    // +not-found.tsx captura la URL antes de redirigir aquí; si no, fallback a getInitialURL
    const pending = consumePendingImport();
    if (pending) {
      importFromUrl(pending);
    } else {
      Linking.getInitialURL().then(url => {
        if (url?.startsWith('content://') || url?.startsWith('file://')) {
          importFromUrl(url);
        }
      });
    }
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.startsWith('content://') || url.startsWith('file://')) {
        importFromUrl(url);
      }
    });
    return () => sub.remove();
  }, []);

  // Al usar "Compartir" desde WhatsApp u otra app (ACTION_SEND)
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  React.useEffect(() => {
    const uri = shareIntent?.files?.[0]?.path;
    if (uri) {
      importFromUrl(uri);
      resetShareIntent();
    }
  }, [shareIntent]);

  async function handleSave(p: Patient) {
    await savePatient(p);
    setPatients(await getPatients());
    // throws on error — caught by AddPatientModal's try-catch
  }

  async function handleEdit(p: Patient) {
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
      const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (result.canceled) return;
      await importFromUrl(result.assets[0].uri);
    } catch { Alert.alert('Error', 'No se pudo importar.'); }
  }

  async function toggleFormat() {
    const next    = settings.timeFormat === '24h' ? '12h' : '24h';
    const updated = await saveSettings({ timeFormat: next });
    setSettings(updated);
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

  function toggleSelectAll() {
    if (selectedIds.length === filteredPatients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredPatients.map(p => p.id));
    }
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
    const sel = patients.filter((p) => selectedIds.includes(p.id));
    await sharePatients(sel, allHospitals);
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const q = searchQuery.trim().toLowerCase();
  const filteredPatients = q
    ? patients.filter(p =>
        p.cama.toLowerCase().includes(q) ||
        p.nombre?.toLowerCase().includes(q) ||
        p.registro?.toLowerCase().includes(q)
      )
    : patients;

  // Agrupar por fecha de sesión (createdAt), más reciente primero
  const grouped = new Map<string, Patient[]>();
  for (const p of filteredPatients) {
    const key = dateKey(p.createdAt ?? '');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  }
  const sortedKeys = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
  const listData: ListItem[] = [];
  for (const key of sortedKeys) {
    listData.push({ type: 'header', label: dateLabel(key), dateKey: key });
    for (const p of grouped.get(key)!) {
      listData.push({ type: 'patient', patient: p });
    }
  }

  return (
    <View style={styles.screen}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={{ height: insets.top, backgroundColor: statusBg }} />

      {/* Barra superior */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>Balance Hídrico</Text>
        <TouchableOpacity style={styles.hospitalBtn} onPress={() => setShowHospitalPicker(true)}>
          <Text style={styles.hospitalBtnText} numberOfLines={1}>
            {(() => {
              const h = allHospitals.find(x => x.id === settings.hospitalId) ?? allHospitals[0];
              if (!h) return 'HNSJ ▾';
              return h.tables.length > 1
                ? `${h.abbreviation} · ${findTable(h, settings.tableId).name} ▾`
                : `${h.abbreviation} ▾`;
            })()}
          </Text>
        </TouchableOpacity>
        {/* SOLO DESARROLLADOR — descomentar para acceder al editor de plantillas */}
        {/* <TouchableOpacity style={styles.templatesBtn} onPress={() => router.push('/templates')}>
          <Text style={styles.templatesBtnText}>📋</Text>
        </TouchableOpacity> */}
        <TouchableOpacity style={styles.formatBtn} onPress={toggleFormat}>
          <Text style={styles.formatBtnText}>{settings.timeFormat}</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar por cama, nombre o registro..."
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          autoCapitalize="none"
        />
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item) => item.type === 'header' ? `hdr-${item.dateKey}` : item.patient.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            {q ? (
              <Text style={styles.emptyText}>Sin resultados para "{q}".</Text>
            ) : (
              <>
                <Text style={styles.emptyText}>No hay pacientes.</Text>
                <Text style={styles.emptySubtext}>Toca "+" para agregar uno.</Text>
              </>
            )}
          </View>
        }
        renderItem={({ item }: { item: ListItem }) => {
          if (item.type === 'header') {
            return (
              <View style={styles.dateHeader}>
                <Text style={styles.dateHeaderText}>{item.label}</Text>
              </View>
            );
          }
          const p = item.patient;
          return (
            <PatientCard
              patient={p}
              table={(() => { const h = allHospitals.find(x => x.id === p.hospitalId); return h && findTable(h, p.tableId); })()}
              onPress={() =>
                multiSelectMode ? toggleSelect(p.id) : router.push(`/patient/${p.id}`)
              }
              onLongPress={() =>
                multiSelectMode ? toggleSelect(p.id) : enterMultiSelect(p.id)
              }
              onDelete={() => handleDelete(p.id)}
              onShare={() => sharePatients([p], allHospitals)}
              onEdit={() => setEditingPatient(p)}
              timeFormat={settings.timeFormat}
              selected={selectedIds.includes(p.id)}
              multiSelectMode={multiSelectMode}
            />
          );
        }}
      />

      {/* Barra de selección múltiple */}
      {multiSelectMode ? (
        <View style={styles.multiBar}>
          <TouchableOpacity style={styles.multiBarCancel} onPress={exitMultiSelect}>
            <Text style={styles.multiBarCancelText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.multiBarSelectAll} onPress={toggleSelectAll}>
            <Text style={styles.multiBarSelectAllText}>
              {selectedIds.length === filteredPatients.length ? 'Ninguno' : 'Todos'}
            </Text>
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
          <TouchableOpacity
            style={[styles.fabImport, importStatus === 'importing' && styles.fabDisabled]}
            onPress={handleImport}
            disabled={importStatus === 'importing'}
          >
            <Text style={styles.fabImportText}>↓ BHD</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Overlay de feedback durante la importación de un .bhd */}
      <Modal visible={importStatus === 'importing'} transparent animationType="fade">
        <View style={styles.importOverlay}>
          <View style={styles.importCard}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.importText}>Importando expediente…</Text>
          </View>
        </View>
      </Modal>

      <EditPatientModal
        visible={editingPatient !== null}
        patient={editingPatient}
        onClose={() => setEditingPatient(null)}
        onSave={handleEdit}
        allHospitals={allHospitals}
        timeFormat={settings.timeFormat}
      />

      <AddPatientModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleSave}
        timeFormat={settings.timeFormat}
        defaultHospitalId={settings.hospitalId}
        defaultTableId={settings.tableId}
        allHospitals={allHospitals}
      />

      <HospitalPickerModal
        visible={showHospitalPicker}
        hospitals={allHospitals}
        selectedId={settings.hospitalId}
        selectedTableId={settings.tableId}
        onSelect={async (h, t) => {
          const updated = await saveSettings({ hospitalId: h.id, tableId: t.id });
          setSettings(updated);
        }}
        onClose={() => setShowHospitalPicker(false)}
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
    maxWidth: 220,
    backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  hospitalBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  formatBtn: {
    backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 20,
  },
  formatBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  // SOLO DESARROLLADOR
  templatesBtn:    { padding: 6 },
  templatesBtnText:{ fontSize: 18 },

  list: { padding: 12, gap: 10, paddingBottom: 90 },

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
  cardTag:     {
    fontSize: 10, fontWeight: '700', color: '#B45309', backgroundColor: '#FEF3C7',
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, overflow: 'hidden',
  },
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
  emptySubtext:    { fontSize: 14, color: '#9CA3AF', marginTop: 6 },
  dateHeader:      { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  dateHeaderText:  { fontSize: 12, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.8 },

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
  fabDisabled: { opacity: 0.5 },

  importOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  importCard: {
    backgroundColor: '#fff', borderRadius: 14, paddingVertical: 28, paddingHorizontal: 32,
    alignItems: 'center', gap: 12,
  },
  importText: { fontSize: 14, fontWeight: '600', color: '#374151' },

  // Buscador
  searchBar: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  searchInput: {
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 14,
    color: '#111827',
  },

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
  multiBarCancelText:    { color: '#fff', fontSize: 16, fontWeight: '700' },
  multiBarSelectAll:     { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.15)' },
  multiBarSelectAllText: { color: '#93C5FD', fontSize: 12, fontWeight: '700' },
  multiBarCount:         { flex: 1, color: '#93C5FD', fontWeight: '600', fontSize: 14, textAlign: 'center' },
  multiBarBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
  },
  multiBarBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  multiBarShare:    { backgroundColor: '#059669' },
  multiBarDelete:   { backgroundColor: '#DC2626' },
  multiBarDisabled: { opacity: 0.4 },

  // Modal base
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

  // ─── Hospital Picker Modal (barra superior) ───────────────────────────────
  pickerOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'center',
  },
  pickerSearch: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#111827',
    backgroundColor: '#F9FAFB', marginBottom: 8,
  },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  pickerItemSelected: { backgroundColor: '#EFF6FF' },
  pickerItemName:     { fontSize: 14, fontWeight: '600', color: '#111827' },
  pickerItemMeta:     { fontSize: 12, color: '#9CA3AF', marginTop: 1 },
  pickerCheck:        { fontSize: 18, color: '#2563EB', marginLeft: 8 },
  pickerHospitalHeader: { paddingTop: 12, paddingBottom: 4, paddingHorizontal: 4 },
  pickerTableItem:    { paddingLeft: 16 },
  pickerTableName:    { flex: 1, fontSize: 14, color: '#374151' },
  pickerEmpty:        { textAlign: 'center', color: '#9CA3AF', paddingVertical: 24, fontSize: 14 },
  pickerCancel: {
    marginTop: 16, paddingVertical: 14, borderRadius: 10,
    backgroundColor: '#F3F4F6', alignItems: 'center',
  },
  pickerCancelText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },

});
