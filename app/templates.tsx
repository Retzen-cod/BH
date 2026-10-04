/**
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  PANTALLA DE DESARROLLADOR — EDITOR DE PLANTILLAS                      │
 * │  Acceso: descomentar el botón 📋 en app/index.tsx (topBar)             │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HospitalConfig, TableConfig, GroupDef, ColDef } from '../src/types/hospital';
import { getAllHospitalsAsync, isBuiltInTable } from '../src/hospitals';
import { getCustomHospitals, saveCustomHospital, deleteCustomTable } from '../src/utils/hospitalStorage';

// ─── Paleta de colores para grupos ───────────────────────────────────────────

const PALETTE: { bg: string; textColor: string; cellBg: string; name: string }[] = [
  { bg: '#DBEAFE', textColor: '#1D4ED8', cellBg: '#F0F9FF', name: 'Azul' },
  { bg: '#D1FAE5', textColor: '#065F46', cellBg: '#F0FDF4', name: 'Verde' },
  { bg: '#FEF3C7', textColor: '#92400E', cellBg: '#FFFBEB', name: 'Amarillo' },
  { bg: '#EDE9FE', textColor: '#5B21B6', cellBg: '#FAF5FF', name: 'Violeta' },
  { bg: '#FCE7F3', textColor: '#9D174D', cellBg: '#FDF4FF', name: 'Rosa' },
  { bg: '#FFEDD5', textColor: '#9A3412', cellBg: '#FFF7ED', name: 'Naranja' },
  { bg: '#ECFEFF', textColor: '#0E7490', cellBg: '#ECFEFF', name: 'Cian' },
  { bg: '#FEF2F2', textColor: '#DC2626', cellBg: '#FFF5F5', name: 'Rojo' },
];

// ─── Anchos predefinidos ──────────────────────────────────────────────────────

const WIDTH_PRESETS = [
  { label: 'S', value: 46 },
  { label: 'M', value: 62 },
  { label: 'L', value: 78 },
  { label: 'XL', value: 96 },
];

// ─── Pantalla ─────────────────────────────────────────────────────────────────

type ViewMode = 'list' | 'editor';

export default function Templates() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [view, setView]           = useState<ViewMode>('list');
  const [hospitals, setHospitals] = useState<HospitalConfig[]>([]);

  // ── Estado del editor (edita UNA tabla de un hospital) ─────────────────────
  const [editId, setEditId]       = useState('');   // id del hospital
  const [editName, setEditName]   = useState('');
  const [editAbbr, setEditAbbr]   = useState('');
  const [hospLocked, setHospLocked] = useState(false); // hospital existente: nombre/abrev. fijos
  const [editTableId, setEditTableId]     = useState('');
  const [editTableName, setEditTableName] = useState('');
  const [editTableExtra, setEditTableExtra] = useState<Partial<TableConfig>>({}); // campos no editables aquí (balance, card…)
  const [editGroups, setEditGroups] = useState<GroupDef[]>([]);
  const [editCols, setEditCols]   = useState<ColDef[]>([]);

  // Formulario nuevo grupo
  const [gLabel, setGLabel]       = useState('');
  const [gColor, setGColor]       = useState(0);

  // Formulario nueva columna
  const [cLabel, setCLabel]       = useState('');
  const [cWidth, setCWidth]       = useState(62);
  const [cGroup, setCGroup]       = useState('');
  const [cIsTA, setCIsTA]         = useState(false);

  // ── Carga ──────────────────────────────────────────────────────────────────

  useFocusEffect(useCallback(() => { loadHospitals(); }, []));

  async function loadHospitals() {
    setHospitals(await getAllHospitalsAsync());
  }

  function resetForms(firstGroup = '') {
    setGLabel(''); setGColor(0);
    setCLabel(''); setCWidth(62); setCGroup(firstGroup); setCIsTA(false);
  }

  // ── Abrir editor ───────────────────────────────────────────────────────────

  /** Hospital nuevo con su primera tabla. */
  function openNew() {
    setEditId(Date.now().toString());
    setEditName(''); setEditAbbr(''); setHospLocked(false);
    setEditTableId(`t_${Date.now()}`); setEditTableName(''); setEditTableExtra({});
    setEditGroups([]); setEditCols([]);
    resetForms();
    setView('editor');
  }

  /** Tabla nueva en un hospital existente (integrado o personalizado). */
  function openNewTable(h: HospitalConfig) {
    setEditId(h.id);
    setEditName(h.name); setEditAbbr(h.abbreviation); setHospLocked(true);
    setEditTableId(`t_${Date.now()}`); setEditTableName(''); setEditTableExtra({});
    setEditGroups([]); setEditCols([]);
    resetForms();
    setView('editor');
  }

  function openEdit(h: HospitalConfig, t: TableConfig) {
    const { id, name, groups, dataCols, ...extra } = t;
    setEditId(h.id);
    setEditName(h.name); setEditAbbr(h.abbreviation); setHospLocked(!h.isCustom);
    setEditTableId(id); setEditTableName(name); setEditTableExtra(extra);
    setEditGroups([...groups]); setEditCols([...dataCols]);
    resetForms(groups[0]?.key ?? '');
    setView('editor');
  }

  // ── Grupos ─────────────────────────────────────────────────────────────────

  function addGroup() {
    if (!gLabel.trim()) { Alert.alert('Nombre requerido', 'Escribe un nombre para el grupo.'); return; }
    const key  = `g_${Date.now()}`;
    const p    = PALETTE[gColor];
    const next = [...editGroups, { key, label: gLabel.trim(), bg: p.bg, textColor: p.textColor, cellBg: p.cellBg }];
    setEditGroups(next);
    if (!cGroup) setCGroup(key);
    setGLabel(''); setGColor(0);
  }

  function removeGroup(key: string) {
    if (editCols.some(c => c.group === key)) {
      Alert.alert('Grupo en uso', 'Elimina primero las columnas de este grupo.');
      return;
    }
    const next = editGroups.filter(g => g.key !== key);
    setEditGroups(next);
    if (cGroup === key) setCGroup(next[0]?.key ?? '');
  }

  // ── Columnas ───────────────────────────────────────────────────────────────

  function addCol() {
    if (!cLabel.trim()) { Alert.alert('Nombre requerido', 'Escribe un nombre para la columna.'); return; }
    if (!cGroup)        { Alert.alert('Grupo requerido',  'Selecciona un grupo.'); return; }
    const key = `c_${Date.now()}`;
    setEditCols(prev => [...prev, { key, label: cLabel.trim(), width: cWidth, group: cGroup, isTA: cIsTA || undefined }]);
    setCLabel(''); setCIsTA(false);
  }

  function removeCol(key: string) {
    setEditCols(prev => prev.filter(c => c.key !== key));
  }

  function moveCol(key: string, dir: -1 | 1) {
    setEditCols(prev => {
      const idx = prev.findIndex(c => c.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  // ── Guardar ────────────────────────────────────────────────────────────────

  async function saveTemplate() {
    if (!editName.trim() || !editAbbr.trim() || !editTableName.trim()) {
      Alert.alert('Campos requeridos', 'El nombre del hospital, la abreviación y el nombre de la tabla son obligatorios.'); return;
    }
    if (editGroups.length === 0) {
      Alert.alert('Sin grupos', 'Agrega al menos un bloque de agrupación.'); return;
    }
    if (editCols.length === 0) {
      Alert.alert('Sin columnas', 'Agrega al menos una columna de datos.'); return;
    }
    const table: TableConfig = {
      ...editTableExtra,
      id: editTableId, name: editTableName.trim(),
      groups: editGroups, dataCols: editCols,
    };
    // Solo se toca la entrada custom de este hospital y solo esta tabla.
    const customs = await getCustomHospitals();
    const entry: HospitalConfig = customs.find(h => h.id === editId)
      ?? { id: editId, name: '', abbreviation: '', isCustom: true, tables: [] };
    if (!hospLocked) {
      entry.name = editName.trim();
      entry.abbreviation = editAbbr.trim().toUpperCase();
    } else if (!entry.name) {
      entry.name = editName; entry.abbreviation = editAbbr;
    }
    const idx = entry.tables.findIndex(t => t.id === table.id);
    if (idx >= 0) entry.tables[idx] = table; else entry.tables.push(table);
    await saveCustomHospital(entry);
    await loadHospitals();
    setView('list');
  }

  async function deleteTemplate(hospitalId: string, tableId: string) {
    Alert.alert('Eliminar tabla', 'Los pacientes que la usen pasarán a la primera tabla del hospital. ¿Confirmas?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        await deleteCustomTable(hospitalId, tableId); await loadHospitals();
      }},
    ]);
  }

  // ── Render: lista ──────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <View style={styles.screen}>
        <View style={{ height: insets.top, backgroundColor: '#1E3A5F' }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Plantillas</Text>
          <TouchableOpacity style={styles.newBtn} onPress={openNew}>
            <Text style={styles.newBtnText}>+ Hospital</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {hospitals.map((h) => (
            <View key={h.id} style={{ marginBottom: 16 }}>
              <View style={styles.hospitalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{h.name}</Text>
                  <Text style={styles.cardAbbr}>{h.abbreviation}</Text>
                </View>
                <TouchableOpacity style={styles.editBtn} onPress={() => openNewTable(h)}>
                  <Text style={styles.editBtnText}>+ Tabla</Text>
                </TouchableOpacity>
              </View>

              {h.tables.map((t) => {
                const builtIn = isBuiltInTable(h.id, t.id);
                return (
                  <View key={t.id} style={styles.card}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardName}>{t.name}</Text>
                      <Text style={styles.cardMeta}>
                        {t.groups.map(g => `${t.dataCols.filter(c => c.group === g.key).length} ${g.label}`).join(' · ')}
                      </Text>
                    </View>
                    {builtIn ? (
                      <View style={styles.builtInBadge}>
                        <Text style={styles.builtInText}>Integrada</Text>
                      </View>
                    ) : (
                      <>
                        <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(h, t)}>
                          <Text style={styles.editBtnText}>✏️ Editar</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteTemplate(h.id, t.id)}>
                          <Text style={styles.deleteBtnText}>🗑</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    );
  }

  // ── Render: editor ─────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <View style={{ height: insets.top, backgroundColor: '#1E3A5F' }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setView('list')} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Lista</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{editTableName || 'Nueva tabla'}</Text>
        <TouchableOpacity style={styles.saveBtn} onPress={saveTemplate}>
          <Text style={styles.saveBtnText}>💾 Guardar</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.editor} keyboardShouldPersistTaps="handled">

        {/* ── Información general ── */}
        <Text style={styles.sectionLabel}>INFORMACIÓN</Text>
        {hospLocked ? (
          <Text style={styles.sectionHint}>{editName} · {editAbbr}</Text>
        ) : (
          <>
            <EField label="Nombre del hospital *" value={editName} onChange={setEditName} />
            <EField label="Abreviación *" value={editAbbr} onChange={setEditAbbr} placeholder="Ej: HNSJDDSM" />
          </>
        )}
        <EField label="Nombre de la tabla *" value={editTableName} onChange={setEditTableName} placeholder="Ej: UCI adultos" />

        {/* ── Grupos de agrupación ── */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>BLOQUES DE AGRUPACIÓN</Text>
        <Text style={styles.sectionHint}>Los bloques agrupan columnas relacionadas con un color en el encabezado.</Text>

        {editGroups.map((g) => (
          <View key={g.key} style={[styles.groupRow, { backgroundColor: g.bg }]}>
            <View style={[styles.groupDot, { backgroundColor: g.textColor }]} />
            <Text style={[styles.groupRowLabel, { color: g.textColor, flex: 1 }]}>{g.label}</Text>
            <TouchableOpacity onPress={() => removeGroup(g.key)} style={styles.rowDeleteBtn}>
              <Text style={{ color: '#DC2626', fontWeight: '700' }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addForm}>
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Nombre del bloque"
            value={gLabel} onChangeText={setGLabel}
            placeholderTextColor="#9CA3AF"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: 8 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {PALETTE.map((p, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setGColor(i)}
                  style={[styles.colorChip, { backgroundColor: p.bg, borderColor: gColor === i ? p.textColor : '#D1D5DB', borderWidth: gColor === i ? 2 : 1 }]}
                >
                  <Text style={{ fontSize: 8, color: p.textColor, fontWeight: '700' }}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.addBtn} onPress={addGroup}>
            <Text style={styles.addBtnText}>+ Agregar</Text>
          </TouchableOpacity>
        </View>

        {/* ── Columnas de datos ── */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>COLUMNAS</Text>
        <Text style={styles.sectionHint}>Cada columna registra un dato por hora (cristaloides, FC, orina, etc.).</Text>

        {editCols.map((col, idx) => {
          const g = editGroups.find(x => x.key === col.group);
          return (
            <View key={col.key} style={[styles.colRow, { borderLeftColor: g?.textColor ?? '#D1D5DB' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.colRowLabel}>{col.label}</Text>
                <Text style={styles.colRowMeta}>
                  {col.width}px · {g?.label ?? col.group}{col.isTA ? ' · T/A' : ''}
                </Text>
              </View>
              <TouchableOpacity onPress={() => moveCol(col.key, -1)} disabled={idx === 0} style={styles.moveBtn}>
                <Text style={{ color: idx === 0 ? '#D1D5DB' : '#374151' }}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => moveCol(col.key, 1)} disabled={idx === editCols.length - 1} style={styles.moveBtn}>
                <Text style={{ color: idx === editCols.length - 1 ? '#D1D5DB' : '#374151' }}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeCol(col.key)} style={styles.rowDeleteBtn}>
                <Text style={{ color: '#DC2626', fontWeight: '700' }}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Formulario agregar columna */}
        <View style={styles.addForm}>
          <TextInput
            style={[styles.addInput, { flex: 1 }]}
            placeholder="Nombre de columna"
            value={cLabel} onChangeText={setCLabel}
            placeholderTextColor="#9CA3AF"
          />
        </View>

        {/* Ancho */}
        <View style={[styles.addForm, { gap: 6, flexWrap: 'wrap' }]}>
          <Text style={styles.formFieldLabel}>Ancho:</Text>
          {WIDTH_PRESETS.map((w) => (
            <TouchableOpacity
              key={w.value}
              onPress={() => setCWidth(w.value)}
              style={[styles.widthChip, cWidth === w.value && styles.widthChipSel]}
            >
              <Text style={[styles.widthChipText, cWidth === w.value && styles.widthChipTextSel]}>
                {w.label} ({w.value})
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Grupo */}
        <View style={[styles.addForm, { gap: 6, flexWrap: 'wrap' }]}>
          <Text style={styles.formFieldLabel}>Grupo:</Text>
          {editGroups.map((g) => (
            <TouchableOpacity
              key={g.key}
              onPress={() => setCGroup(g.key)}
              style={[styles.groupChip, { backgroundColor: g.bg, borderColor: cGroup === g.key ? g.textColor : '#D1D5DB', borderWidth: cGroup === g.key ? 2 : 1 }]}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: g.textColor }}>{g.label}</Text>
            </TouchableOpacity>
          ))}
          {editGroups.length === 0 && <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Crea grupos primero</Text>}
        </View>

        {/* T/A toggle */}
        <View style={[styles.addForm, { alignItems: 'center', gap: 10 }]}>
          <Text style={styles.formFieldLabel}>Teclado T/A (Sist/Diast):</Text>
          <Switch value={cIsTA} onValueChange={setCIsTA} trackColor={{ true: '#2563EB' }} />
          <TouchableOpacity style={styles.addBtn} onPress={addCol}>
            <Text style={styles.addBtnText}>+ Agregar columna</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Campo de texto del editor ────────────────────────────────────────────────

function EField({ label, value, onChange, placeholder }: {
  label: string; value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.efield}>
      <Text style={styles.efieldLabel}>{label}</Text>
      <TextInput
        style={styles.efieldInput}
        value={value} onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        autoCapitalize="words"
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
    backgroundColor: '#1E3A5F', gap: 10,
  },
  backBtn:     { paddingVertical: 4, paddingHorizontal: 2 },
  backBtnText: { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  topBarTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '800' },
  newBtn:      { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  newBtnText:  { color: '#fff', fontWeight: '700', fontSize: 13 },
  saveBtn:     { backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  list:   { padding: 16, paddingBottom: 40 },
  editor: { padding: 16, paddingBottom: 40 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: '#6B7280', letterSpacing: 1, marginBottom: 8 },
  sectionHint:  { fontSize: 12, color: '#9CA3AF', marginBottom: 10, marginTop: -4 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, elevation: 2,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardAbbr: { fontSize: 12, color: '#6B7280' },
  cardMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 3 },

  hospitalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  builtInBadge: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  builtInText:  { fontSize: 11, fontWeight: '600', color: '#9CA3AF' },
  editBtn:      { backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginRight: 6 },
  editBtnText:  { fontSize: 12, fontWeight: '600', color: '#2563EB' },
  deleteBtn:    { paddingHorizontal: 10, paddingVertical: 6 },
  deleteBtnText:{ fontSize: 16 },
  emptyText:    { fontSize: 13, color: '#9CA3AF', textAlign: 'center', marginTop: 12 },

  // Grupos
  groupRow: {
    flexDirection: 'row', alignItems: 'center', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
  },
  groupDot:      { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  groupRowLabel: { fontSize: 13, fontWeight: '600' },
  rowDeleteBtn:  { paddingHorizontal: 8, paddingVertical: 4 },

  // Columnas
  colRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, borderLeftWidth: 4,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, elevation: 1,
  },
  colRowLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  colRowMeta:  { fontSize: 11, color: '#9CA3AF' },
  moveBtn:     { paddingHorizontal: 8, paddingVertical: 4 },

  // Formularios inline
  addForm: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 8, gap: 8,
  },
  addInput: {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB',
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827',
  },
  addBtn:     { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  colorChip: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6,
    justifyContent: 'center', alignItems: 'center',
  },
  widthChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB',
  },
  widthChipSel:     { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  widthChipText:    { fontSize: 12, fontWeight: '600', color: '#374151' },
  widthChipTextSel: { color: '#fff' },
  groupChip:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },

  formFieldLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },

  // Campos del editor
  efield:       { marginBottom: 10 },
  efieldLabel:  { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  efieldInput:  {
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#111827',
  },
});
