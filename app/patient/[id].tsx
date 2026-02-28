import React, { useEffect, useRef, useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, Share, ActivityIndicator, NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as NavigationBar from 'expo-navigation-bar';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import { Patient, TableRow, BlockSummary } from '../../src/types';
import { getHospitalAsync } from '../../src/hospitals';
import { HospitalConfig } from '../../src/types/hospital';
import { HNSJDDSM } from '../../src/hospitals/HNSJDDSM';
import { getPatient, savePatient } from '../../src/utils/storage';
import { getSettings, formatHora, formatDate, Settings } from '../../src/utils/settings';
import {
  calcPAM, calcBlocks, calcBHTotal, calcDHTotal,
} from '../../src/utils/calculations';
import TableCell from '../../src/components/TableCell';

// ─── Dimensiones ─────────────────────────────────────────────────────────────

const ROW_H    = 32;
const HEADER_H = 36;
const GROUP_H  = 22;

const FIXED_N_W    = 36;
const FIXED_HORA_W = 60;
const FIXED_W      = FIXED_N_W + FIXED_HORA_W;

const BLOCK_W    = 140;
const BLOCK_PI_H = 22;


// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function PatientTable() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const [patient, setPatient]     = useState<Patient | null>(null);
  const [hospital, setHospital]   = useState<HospitalConfig>(HNSJDDSM);
  const [settings, setSettings]   = useState<Settings>({ timeFormat: '24h', hospitalId: 'HNSJDDSM' });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync horizontal scroll: data → header
  const headerScrollRef = useRef<ScrollView>(null);
  const dataScrollRef   = useRef<ScrollView>(null);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    NavigationBar.setVisibilityAsync('hidden');
    NavigationBar.setBehaviorAsync('overlay-swipe');
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  useEffect(() => {
    if (id) {
      getPatient(id).then(async (p) => {
        if (p) {
          setPatient(p);
          setHospital(await getHospitalAsync(p.hospitalId));
        }
      });
      getSettings().then(setSettings);
    }
  }, [id]);

  const persist = useCallback((updated: Patient) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => savePatient(updated), 600);
  }, []);

  function updateCell(rowIndex: number, colKey: string, raw: string) {
    if (!patient) return;
    const rows = [...patient.rows];
    const row  = { ...rows[rowIndex] };
    if (colKey === 'ta') {
      row.ta  = raw;
      row.pam = calcPAM(raw);
    } else {
      const num = parseFloat(raw);
      (row as any)[colKey] = isNaN(num) ? undefined : num;
    }
    rows[rowIndex] = row;
    const updated = { ...patient, rows };
    setPatient(updated);
    persist(updated);
  }

  async function handleExport() {
    if (!patient) return;
    try {
      const json = JSON.stringify(patient, null, 2);
      const path = `${FileSystem.cacheDirectory}cama_${patient.cama}_bh.json`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: `BH Cama ${patient.cama}` });
      } else {
        await Share.share({ message: json, title: `BH Cama ${patient.cama}` });
      }
    } catch { Alert.alert('Error', 'No se pudo exportar.'); }
  }

  function onDataScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (!patient) {
    return <View style={styles.loading}><ActivityIndicator size="large" color="#2563EB" /></View>;
  }

  const peso     = patient.peso ?? 70;
  const sc       = patient.sc   ?? 1.7;
  const rows     = patient.rows;
  const blocks   = calcBlocks(rows, peso, sc);
  const bhTotal  = calcBHTotal(blocks);
  const dhTotal  = calcDHTotal(blocks);
  const tf       = settings.timeFormat;
  const dataCols = hospital.dataCols;
  const groupMap = Object.fromEntries(hospital.groups.map((g) => [g.key, g]));
  const DATA_W   = dataCols.reduce((a, c) => a + c.width, 0);

  const allBlocksHaveData = blocks.length > 0 && blocks.every(b => b.e > 0 || (b.s - b.pi) > 0);

  // ── Encabezados desplazables ───────────────────────────────────────────────

  function renderGroupHeaders() {
    const groups: { label: string; bg: string; textColor: string; width: number }[] = [];
    for (const col of dataCols) {
      const g    = groupMap[col.group];
      const last = groups[groups.length - 1];
      if (last && last.label === (g?.label ?? '')) {
        last.width += col.width;
      } else {
        groups.push({ ...(g ?? { label: '', bg: '#E5E7EB', textColor: '#374151' }), width: col.width });
      }
    }
    return (
      <View style={[styles.row, { height: GROUP_H }]}>
        {groups.map((g, i) => (
          <View key={i} style={[styles.groupCell, { width: g.width, backgroundColor: g.bg }]}>
            <Text style={[styles.groupText, { color: g.textColor }]}>{g.label}</Text>
          </View>
        ))}
        <View style={[styles.groupCell, { width: BLOCK_W, backgroundColor: '#EDE9FE', borderLeftWidth: 3, borderLeftColor: '#7C3AED' }]}>
          <Text style={[styles.groupText, { color: '#5B21B6' }]}>📊 Bloque (4h)</Text>
        </View>
      </View>
    );
  }

  function renderColHeaders() {
    return (
      <View style={[styles.row, { height: HEADER_H }]}>
        {dataCols.map((col) => (
          <View key={col.key} style={[styles.colHeader, { width: col.width, backgroundColor: groupMap[col.group]?.bg ?? '#E5E7EB' }]}>
            <Text style={styles.colHeaderText} numberOfLines={2}>{col.label}</Text>
          </View>
        ))}
        <View style={[styles.colHeader, { width: BLOCK_W, backgroundColor: '#EDE9FE', borderLeftWidth: 3, borderLeftColor: '#7C3AED' }]}>
          <Text style={[styles.colHeaderText, { color: '#5B21B6' }]}>PI · E · S · BH · DH</Text>
        </View>
      </View>
    );
  }

  // ── Filas de datos ─────────────────────────────────────────────────────────

  function renderDataRow(row: TableRow, rowIndex: number) {
    const alt = rowIndex % 2 !== 0;
    return (
      <View key={rowIndex} style={[styles.row, { height: ROW_H, backgroundColor: alt ? '#FAFAFA' : '#fff' }]}>
        {dataCols.map((col) => {
          const val = (row as any)[col.key];
          return (
            <TableCell
              key={col.key}
              value={val}
              fieldName={col.label}
              isTA={col.isTA}
              readOnly={col.readOnly}
              style={{ width: col.width, backgroundColor: col.readOnly ? '#EFF6FF' : (alt ? '#FAFAFA' : groupMap[col.group]?.cellBg ?? '#fff') }}
              onCommit={(v) => updateCell(rowIndex, col.key, v)}
            />
          );
        })}
      </View>
    );
  }

  // ── Panel de bloques ───────────────────────────────────────────────────────

  function renderBlockPanel() {
    return (
      <View style={[styles.blockPanel, { width: BLOCK_W }]}>
        {blocks.map((b) => {
          const numRows = Math.min(4, rows.length - b.blockIndex * 4);
          const cellH   = numRows * ROW_H;
          const metricH = Math.floor((cellH - BLOCK_PI_H) / 4);
          const pos     = b.bh >= 0;

          const metrics = [
            { label: 'E',  val: b.e.toFixed(1),                     color: '#065F46' },
            { label: 'S',  val: b.s.toFixed(1),                     color: '#92400E' },
            { label: 'BH', val: (pos ? '+' : '') + b.bh.toFixed(1), color: pos ? '#DC2626' : '#059669' },
            { label: 'DH', val: b.dh.toFixed(2),                    color: '#1D4ED8' },
          ];

          return (
            <View key={b.blockIndex} style={[styles.blockCell, { height: cellH }]}>
              <View style={[styles.blockPIRow, { height: BLOCK_PI_H }]}>
                <Text style={styles.blockPIKey}>PI</Text>
                <Text style={styles.blockPIVal}>{b.pi.toFixed(1)} mL</Text>
                <Text style={styles.blockTime}> {formatHora(b.startHora, tf)}–{formatHora(b.endHora, tf)}</Text>
              </View>
              {metrics.map(({ label, val, color }) => (
                <View key={label} style={[styles.blockMetricRow, { height: metricH }]}>
                  <Text style={styles.blockMetricKey}>{label}</Text>
                  <Text style={[styles.blockMetricVal, { color }]} numberOfLines={1}>{val}</Text>
                </View>
              ))}
            </View>
          );
        })}

        {allBlocksHaveData ? (
          <View style={[styles.blockTotals, { height: ROW_H }]}>
            <View style={styles.blockTotRow}>
              <Text style={styles.blockTotKey}>BH</Text>
              <Text style={[styles.blockTotVal, { color: bhTotal >= 0 ? '#DC2626' : '#059669' }]}>
                {(bhTotal >= 0 ? '+' : '') + bhTotal.toFixed(1)}
              </Text>
            </View>
            <View style={styles.blockTotRow}>
              <Text style={styles.blockTotKey}>DH</Text>
              <Text style={[styles.blockTotVal, { color: '#1D4ED8' }]}>{dhTotal.toFixed(2)}</Text>
            </View>
          </View>
        ) : (
          <View style={[styles.blockTotals, { height: ROW_H, justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ fontSize: 9, color: '#9CA3AF' }}>Completa todos los bloques</Text>
          </View>
        )}
      </View>
    );
  }

  // ── Fila de totales ────────────────────────────────────────────────────────

  function renderTotalsRow() {
    return (
      <View style={[styles.row, styles.totalsRow, { height: ROW_H }]}>
        {dataCols.map((col) => (
          <View key={col.key} style={[styles.cell, { width: col.width }]}>
            {col.key === 'cristaloides'
              ? <Text style={styles.totalVal}>TOTALES</Text>
              : null}
          </View>
        ))}
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar hidden />

      {/* Barra superior */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.btnBack}>
          <Text style={styles.btnBackText}>← Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerCama}>Cama {patient.cama}</Text>
          {patient.nombre ? <Text style={styles.headerNombre}>{patient.nombre}</Text> : null}
          <Text style={styles.headerMeta}>
            {[patient.edad ? `${patient.edad}a` : null, `${peso} kg`, `SC ${sc} m²`].filter(Boolean).join(' · ')}
          </Text>
          {patient.createdAt
            ? <Text style={styles.headerDate}>{formatDate(patient.createdAt)}</Text>
            : null}
        </View>
        <View style={styles.headerStats}>
          <Text style={[styles.headerBHVal, { color: bhTotal >= 0 ? '#FCA5A5' : '#6EE7B7' }]}>
            {(bhTotal >= 0 ? '+' : '') + bhTotal.toFixed(1)} mL
          </Text>
          <Text style={styles.headerStatLabel}>BH Total</Text>
        </View>
        <View style={styles.headerStats}>
          <Text style={styles.headerDHVal}>{dhTotal.toFixed(2)}</Text>
          <Text style={styles.headerStatLabel}>DH mL/kg/h</Text>
        </View>
        <TouchableOpacity style={styles.btnExport} onPress={handleExport}>
          <Text style={styles.btnExportText}>↑ Compartir</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabla ── */}
      <View style={styles.tableContainer}>

        {/* ── ENCABEZADOS FIJOS (sticky, no hacen scroll vertical) ── */}
        <View style={styles.stickyHeaders}>
          {/* Encabezado de la columna fija */}
          <View style={styles.fixedColBlock}>
            <View style={[styles.fixedGroupRow, { height: GROUP_H }]}>
              <Text style={styles.fixedGroupText}>Control</Text>
            </View>
            <View style={[styles.row, { height: HEADER_H }]}>
              <View style={[styles.fixedColHeader, { width: FIXED_N_W }]}>
                <Text style={styles.colHeaderText}>N°</Text>
              </View>
              <View style={[styles.fixedColHeader, { width: FIXED_HORA_W }]}>
                <Text style={styles.colHeaderText}>Hora</Text>
              </View>
            </View>
          </View>

          {/* Encabezados de columnas desplazables */}
          <ScrollView
            ref={headerScrollRef}
            horizontal
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
          >
            <View>
              {renderGroupHeaders()}
              {renderColHeaders()}
            </View>
          </ScrollView>
        </View>

        {/* ── DATOS (scroll vertical único para columna fija + tabla) ── */}
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}>
          <View style={styles.dataArea}>

            {/* Columna fija de datos */}
            <View style={styles.fixedDataCol}>
              {rows.map((row, i) => (
                <View key={i} style={[styles.row, { height: ROW_H, backgroundColor: i % 2 !== 0 ? '#FAFAFA' : '#fff' }]}>
                  <View style={[styles.fixedCell, { width: FIXED_N_W }]}>
                    <Text style={styles.fixedCellText}>{i + 1}</Text>
                  </View>
                  <View style={[styles.fixedCell, { width: FIXED_HORA_W }]}>
                    <Text style={styles.fixedCellText}>{formatHora(row.hora, tf)}</Text>
                  </View>
                </View>
              ))}
              {/* Totales */}
              <View style={[styles.row, styles.totalsRow, { height: ROW_H }]}>
                <View style={[styles.fixedCell, { width: FIXED_N_W }]} />
                <View style={[styles.fixedCell, { width: FIXED_HORA_W }]}>
                  <Text style={[styles.fixedCellText, { fontWeight: '800', fontSize: 10 }]}>TOT.</Text>
                </View>
              </View>
            </View>

            {/* Datos desplazables horizontalmente */}
            <ScrollView
              ref={dataScrollRef}
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              onScroll={onDataScroll}
              scrollEventThrottle={16}
              style={{ flex: 1 }}
            >
              <View style={{ flexDirection: 'row' }}>
                <View style={{ width: DATA_W }}>
                  {rows.map((row, i) => renderDataRow(row, i))}
                  {renderTotalsRow()}
                </View>
                {renderBlockPanel()}
              </View>
            </ScrollView>

          </View>
        </ScrollView>

      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1E3A5F', gap: 10,
  },
  btnBack:         { paddingHorizontal: 6, paddingVertical: 4 },
  btnBackText:     { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  headerInfo:      { flex: 1 },
  headerCama:      { color: '#fff',    fontSize: 15, fontWeight: '800' },
  headerNombre:    { color: '#CBD5E1', fontSize: 11 },
  headerMeta:      { color: '#94A3B8', fontSize: 10 },
  headerDate:      { color: '#64748B', fontSize: 9,  marginTop: 1 },
  headerStats:     { alignItems: 'flex-end' },
  headerBHVal:     { fontSize: 18, fontWeight: '900' },
  headerDHVal:     { fontSize: 14, fontWeight: '700', color: '#93C5FD' },
  headerStatLabel: { color: '#94A3B8', fontSize: 9 },
  btnExport:       { backgroundColor: '#25D366', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnExportText:   { color: '#fff', fontWeight: '700', fontSize: 12 },

  // ── Layout principal ──
  tableContainer: { flex: 1, flexDirection: 'column' },

  // Encabezados sticky (fuera del ScrollView vertical)
  stickyHeaders: {
    flexDirection: 'row',
    height: GROUP_H + HEADER_H,
    borderBottomWidth: 0,
  },
  // Bloque de encabezado de la columna fija
  fixedColBlock: {
    width: FIXED_W,
    backgroundColor: '#F3F4F6',
    borderRightWidth: 2,
    borderRightColor: '#374151',
    zIndex: 2,
  },

  // Área de datos (columna fija + horizontal scroll, misma fila)
  dataArea: {
    flexDirection: 'row',
  },
  // Columna fija de datos
  fixedDataCol: {
    width: FIXED_W,
    backgroundColor: '#F3F4F6',
    borderRightWidth: 2,
    borderRightColor: '#374151',
    zIndex: 2,
  },

  // ── Encabezados ──
  fixedGroupRow: {
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#D1D5DB',
  },
  fixedGroupText:  { fontSize: 9, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  fixedColHeader: {
    height: HEADER_H, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 2, borderColor: '#D1D5DB',
  },

  // ── Celdas fijas ──
  fixedCell: {
    height: ROW_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB',
  },
  fixedCellText: { fontSize: 11, color: '#374151', fontVariant: ['tabular-nums'] },

  // ── Encabezados desplazables ──
  row:       { flexDirection: 'row' },
  groupCell: {
    height: GROUP_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#D1D5DB',
  },
  groupText:     { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  colHeader:     {
    height: HEADER_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 2, borderColor: '#D1D5DB', paddingHorizontal: 2,
  },
  colHeaderText: { fontSize: 10, fontWeight: '700', color: '#374151', textAlign: 'center' },

  // ── Celdas de datos ──
  cell: {
    height: ROW_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB',
  },

  // ── Panel de bloques ──
  blockPanel: {
    borderLeftWidth: 3, borderLeftColor: '#7C3AED', backgroundColor: '#FAF5FF',
  },
  blockCell: {
    flexDirection: 'column',
    borderBottomWidth: 2, borderBottomColor: '#C4B5FD',
    overflow: 'hidden',
  },
  blockPIRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#EDE9FE', paddingHorizontal: 5,
    borderBottomWidth: 1, borderBottomColor: '#DDD6FE',
  },
  blockPIKey:  { fontSize: 9, fontWeight: '800', color: '#5B21B6', width: 16 },
  blockPIVal:  { fontSize: 9, fontWeight: '700', color: '#5B21B6', flex: 1 },
  blockTime:   { fontSize: 8, color: '#7C3AED' },
  blockMetricRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 5,
    borderBottomWidth: 1, borderBottomColor: '#EDE9FE',
  },
  blockMetricKey: { fontSize: 9, fontWeight: '700', color: '#6B7280', width: 22 },
  blockMetricVal: { fontSize: 11, fontWeight: '800', flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  blockTotals: {
    flexDirection: 'row', backgroundColor: '#EDE9FE',
    borderTopWidth: 2, borderTopColor: '#7C3AED',
    paddingHorizontal: 4, alignItems: 'center',
  },
  blockTotRow: { flex: 1, alignItems: 'center' },
  blockTotKey: { fontSize: 8, fontWeight: '700', color: '#374151' },
  blockTotVal: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },

  // ── Totales ──
  totalVal:  { fontSize: 11, fontWeight: '800', color: '#1E3A5F', fontVariant: ['tabular-nums'] },
  totalsRow: { backgroundColor: '#EFF6FF', borderTopWidth: 2, borderTopColor: '#2563EB' },
});
