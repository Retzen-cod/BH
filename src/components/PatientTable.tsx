import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  NativeSyntheticEvent, NativeScrollEvent,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { Patient, TableRow } from '../types';
import { HospitalConfig, TableConfig, ColDef } from '../types/hospital';
import { Settings, formatHora, formatDate } from '../utils/settings';
import { calcBlocks, calcBHTotal, calcDHTotal, calcSC, scEtiqueta, scDetalle, calcMantDiario, groupKeys, sumKeys } from '../utils/calculations';
import { TableGestureRegistry, TableGestureContext } from '../gestures/tableGestures';
import '../gestures/defaultGestures'; // registra los gestos por defecto
import TableCell from './TableCell';

// ─── Dimensiones ──────────────────────────────────────────────────────────────

const ROW_H    = 32;
const HEADER_H = 36;
const GROUP_H  = 22;

const FIXED_N_W    = 36;
const FIXED_HORA_W = 60;
const FIXED_W      = FIXED_N_W + FIXED_HORA_W;

const BLOCK_W = 140;

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  patient:              Patient;
  hospital:             HospitalConfig;
  table:                TableConfig;
  settings:             Settings;
  onUpdateCell:         (rowIndex: number, colKey: string, raw: string) => void;
  onBatchUpdateCells:   (updates: { rowIndex: number; colKey: string; raw: string }[]) => void;
  onUndo:               () => void;
  onRedo:               () => void;
  canUndo:              boolean;
  canRedo:              boolean;
  onToggleBlock:        (blockIndex: number) => void;
  onColOverride:        (slotKey: string, activeKey: string | null) => void;
  onColLabelChange:     (slotKey: string, label: string | null) => void;
  onEditInfo:           (updated: Patient) => void;
  onExport:             () => void;
  onBack:               () => void;
}

// ─── Estado de interacción de celdas ─────────────────────────────────────────

/** Rectángulo de selección durante el drag (4 coordenadas en índices). */
type DragSelection = {
  anchorRow:    number;
  anchorColIdx: number;
  curRow:       number;
  curColIdx:    number;
};

/** Selección confirmada al soltar el dedo (caso ambiguo → espera decisión). */
type CellInteraction = {
  srcRow:   number;
  srcCol:   string;
  srcValue: string;
  selected: { row: number; col: string }[];
};

type InferredAction = 'copy' | 'replace' | 'erase' | 'ambiguous' | 'none';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Suma del grupo en una fila — mismas columnas que calcBlocks (incluye alternates ocultas). */
function groupRowTotal(row: TableRow, group: string, slots: ColDef[]): number {
  return sumKeys(row, groupKeys(slots, group));
}

/** Resuelve la ColDef activa para un slot dado el mapa de overrides. */
function resolveActive(slot: ColDef, overrides: Record<string, string>): ColDef {
  const activeKey = overrides[slot.key];
  if (!activeKey) return slot;
  return slot.alternates?.find(a => a.key === activeKey) ?? slot;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function PatientTable({
  patient, hospital, table, settings,
  onUpdateCell, onBatchUpdateCells, onUndo, onRedo, canUndo, canRedo,
  onToggleBlock, onColOverride, onColLabelChange, onEditInfo,
  onExport, onBack,
}: Props) {
  const headerScrollRef = useRef<ScrollView>(null);
  const dataScrollRef   = useRef<ScrollView>(null);
  const [showEdit, setShowEdit]         = useState(false);
  const [selRect,     setSelRect]       = useState<DragSelection | null>(null);
  const [interaction, setInteraction]   = useState<CellInteraction | null>(null);
  const [swapMenuSlotKey, setSwapMenuSlotKey] = useState<string | null>(null);
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});

  // ── Selección de celdas ───────────────────────────────────────────────────
  const dragSelRef      = useRef<DragSelection | null>(null);
  const handleStartRef  = useRef({ x: 0, y: 0 });
  // commitDrag se reescribe cada render para capturar valores frescos
  const commitDragRef   = useRef<() => void>(() => {});
  // Contexto de datos actualizado cada render
  const dragCtxRef      = useRef({ rows: patient.rows, slots: table.dataCols, activeCols: [] as ColDef[] });

  // ── Sistema de gestos ─────────────────────────────────────────────────────
  // El contexto vive en un ref para que los handlers lean valores frescos
  // sin necesidad de re-crear el gesto en cada render.
  const gestureCtxRef = useRef<TableGestureContext>({
    patient, hospital, table, onUndo, onRedo, onUpdateCell,
  });
  useEffect(() => {
    gestureCtxRef.current = { patient, hospital, table, onUndo, onRedo, onUpdateCell };
    dragCtxRef.current = { rows: patient.rows, slots: table.dataCols, activeCols };
    commitDragRef.current = () => {
      const drag = dragSelRef.current;
      if (!drag) return;
      const { rows: r, slots: s, activeCols: ac } = dragCtxRef.current;
      const cMin = Math.min(drag.anchorColIdx, drag.curColIdx);
      const cMax = Math.max(drag.anchorColIdx, drag.curColIdx);
      const rMin = Math.min(drag.anchorRow, drag.curRow);
      const rMax = Math.max(drag.anchorRow, drag.curRow);
      const srcCol   = ac[drag.anchorColIdx];
      const srcValue = String((r[drag.anchorRow] as any)[srcCol.key] ?? '');
      const selected: { row: number; col: string }[] = [];
      for (let row = rMin; row <= rMax; row++) {
        for (let col = cMin; col <= cMax; col++) {
          if (!s[col] || s[col].isTotal || ac[col].readOnly) continue;
          if (row === drag.anchorRow && col === drag.anchorColIdx) continue;
          selected.push({ row, col: ac[col].key });
        }
      }
      // single cell — keep selRect so the action bar stays visible
      if (selected.length === 0) return;
      const action = inferAction(srcValue, selected, r);
      const ia: CellInteraction = { srcRow: drag.anchorRow, srcCol: srcCol.key, srcValue, selected };
      if (action === 'ambiguous') {
        setInteraction(ia);
      } else if (action !== 'none') {
        executeAction(action, ia, r);
        cancelInteraction();
      }
    };
  });

  useEffect(() => {
    if (swapMenuSlotKey) {
      setLabelDrafts(prev => ({
        ...prev,
        [swapMenuSlotKey]: (patient.colLabels ?? {})[swapMenuSlotKey] ?? '',
      }));
    }
  }, [swapMenuSlotKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const combinedGesture = useMemo(() => {
    const defs = TableGestureRegistry.getAll();
    if (defs.length === 0) return Gesture.Tap();
    const gestures = defs.map(d => d.create(gestureCtxRef));
    return gestures.length === 1 ? gestures[0] : Gesture.Simultaneous(...gestures);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Gesto del handle: arrastra la esquina inferior-derecha del overlay para extender la selección. */
  const handlePanGesture = useMemo(() =>
    Gesture.Pan()
      .activeOffsetX([-1, 1])
      .activeOffsetY([-1, 1])
      .runOnJS(true)
      .onStart(() => {
        const sel = dragSelRef.current;
        if (!sel) return;
        const { slots } = dragCtxRef.current;
        const cMax = Math.max(sel.anchorColIdx, sel.curColIdx);
        const rMax = Math.max(sel.anchorRow, sel.curRow);
        handleStartRef.current = {
          x: slots.slice(0, cMax + 1).reduce((a, s) => a + s.width, 0),
          y: (rMax + 1) * ROW_H,
        };
      })
      .onUpdate((e) => {
        const sel = dragSelRef.current;
        if (!sel) return;
        const { rows, slots, activeCols: ac } = dragCtxRef.current;
        const targetX = Math.max(0, handleStartRef.current.x + e.translationX);
        const targetY = Math.max(0, handleStartRef.current.y + e.translationY);
        let acc = 0, curColIdx = sel.anchorColIdx;
        for (let i = 0; i < slots.length; i++) {
          if (targetX > acc && targetX <= acc + slots[i].width) {
            if (!slots[i].isTotal && !ac[i]?.readOnly) curColIdx = i;
            break;
          }
          acc += slots[i].width;
        }
        curColIdx = Math.max(sel.anchorColIdx, curColIdx);
        const curRow = Math.max(sel.anchorRow, Math.min(Math.ceil(targetY / ROW_H) - 1, rows.length - 1));
        const drag: DragSelection = { anchorRow: sel.anchorRow, anchorColIdx: sel.anchorColIdx, curRow, curColIdx };
        dragSelRef.current = drag;
        setSelRect({ ...drag });
      })
      .onEnd(() => commitDragRef.current()),
  []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Estado del formulario de edición ──────────────────────────────────────
  const [editCama,      setEditCama]      = useState('');
  const [editNombre,    setEditNombre]    = useState('');
  const [editEdad,      setEditEdad]      = useState('');
  const [editRegistro,  setEditRegistro]  = useState('');
  const [editPeso,      setEditPeso]      = useState('');
  const [editTalla,     setEditTalla]     = useState('');
  const [editStartHora, setEditStartHora] = useState('07:00');

  function openEdit() {
    setEditCama(patient.cama);
    setEditNombre(patient.nombre    ?? '');
    setEditEdad(patient.edad        != null ? String(patient.edad)  : '');
    setEditRegistro(patient.registro ?? '');
    setEditPeso(patient.peso        != null ? String(patient.peso)  : '');
    setEditTalla(patient.talla      != null ? String(patient.talla) : '');
    setEditStartHora(patient.startHora ?? '07:00');
    setShowEdit(true);
  }

  function saveEdit() {
    if (!editCama.trim()) { Alert.alert('Campo requerido', 'El N° de cama es obligatorio.'); return; }
    if (!editPeso || isNaN(Number(editPeso)) || Number(editPeso) <= 0) {
      Alert.alert('Campo requerido', 'El peso es obligatorio.'); return;
    }
    const p = Number(editPeso);
    onEditInfo({
      ...patient,
      cama:      editCama.trim(),
      nombre:    editNombre.trim()   || undefined,
      edad:      editEdad             ? Number(editEdad)   : undefined,
      registro:  editRegistro.trim() || undefined,
      peso:      p,
      talla:     editTalla            ? Number(editTalla)  : undefined,
      sc:        calcSC(p, table, editTalla ? Number(editTalla) : undefined),
      startHora: editStartHora,
      endHora:   editStartHora,
    });
    setShowEdit(false);
  }

  const pf = table.patientFields;

  const peso    = patient.peso ?? 70;
  // SC siempre derivada del peso con la regla de la tabla (el valor guardado puede ser de otra fórmula)
  const sc      = calcSC(peso, table, patient.talla);
  const scTag   = scEtiqueta(peso, table);
  const rows    = patient.rows;
  const tf      = settings.timeFormat;

  const overrides  = patient.colOverrides ?? {};
  const colLabels  = patient.colLabels ?? {};
  const disabled   = patient.disabledBlocks ?? [];
  const slots      = table.dataCols;
  const activeCols = slots.map(slot => resolveActive(slot, overrides));
  const groupMap   = Object.fromEntries(table.groups.map(g => [g.key, g]));
  const DATA_W     = slots.reduce((a, s) => a + s.width, 0);
  function displayLabel(slot: ColDef): string {
    return colLabels[slot.key] ?? resolveActive(slot, overrides).label;
  }

  const allBlocks     = calcBlocks(rows, peso, sc, table);
  const enabledBlocks = allBlocks.filter(b => !disabled.includes(b.blockIndex));
  const bhTotal       = calcBHTotal(enabledBlocks);
  const dhTotal       = calcDHTotal(enabledBlocks);
  const mantDia       = calcMantDiario(peso, table); // undefined si la tabla no declara mantenimiento

  // PI de referencia para un bloque estándar de 4h
  const piRef4h = ((sc * 400 / 24) * 4).toFixed(2);


  function onDataScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });
  }

  // ── Inferencia de acción por contenido ───────────────────────────────────

  function inferAction(srcValue: string, selected: { row: number; col: string }[], rows: TableRow[]): InferredAction {
    if (selected.length === 0) return 'none';
    const srcFull  = srcValue !== '';
    const fullCells = selected.filter(c => String((rows[c.row] as any)[c.col] ?? '') !== '');
    const emptyCells = selected.length - fullCells.length;
    if (!srcFull) return fullCells.length > 0 ? 'erase' : 'none';
    if (emptyCells === 0) return 'replace';
    if (fullCells.length === 0) return 'copy';
    return 'ambiguous';
  }

  function executeAction(action: 'copy' | 'replace' | 'erase', ia: CellInteraction, rows: TableRow[]) {
    let updates: { rowIndex: number; colKey: string; raw: string }[];
    switch (action) {
      case 'copy':
        updates = ia.selected
          .filter(c => String((rows[c.row] as any)[c.col] ?? '') === '')
          .map(c => ({ rowIndex: c.row, colKey: c.col, raw: ia.srcValue }));
        break;
      case 'replace':
        updates = ia.selected.map(c => ({ rowIndex: c.row, colKey: c.col, raw: ia.srcValue }));
        break;
      case 'erase':
        updates = ia.selected
          .filter(c => String((rows[c.row] as any)[c.col] ?? '') !== '')
          .map(c => ({ rowIndex: c.row, colKey: c.col, raw: '' }));
        break;
    }
    if (updates.length > 0) onBatchUpdateCells(updates);
  }

  function cancelInteraction() {
    setInteraction(null);
    setSelRect(null);
    dragSelRef.current = null;
  }

  // ── Intercambio de columna vía hold-tap ──────────────────────────────────

  function showSwapMenu(slot: ColDef) {
    setSwapMenuSlotKey(slot.key);
  }

  // ── Activar / desactivar bloque ──────────────────────────────────────────

  function confirmToggleBlock(blockIndex: number) {
    const isDisabled = disabled.includes(blockIndex);
    Alert.alert(
      isDisabled ? 'Activar bloque' : 'Desactivar bloque',
      isDisabled
        ? 'Este bloque volverá a incluirse en BH-Total y DH-Total.'
        : 'Las filas de este bloque quedan vacías para el cálculo de BH-Total y DH-Total.',
      [
        { text: isDisabled ? 'Activar' : 'Desactivar', onPress: () => onToggleBlock(blockIndex) },
        { text: 'Cancelar', style: 'cancel' },
      ],
    );
  }

  // ── Interacción de celdas: copiar / mover / borrar ───────────────────────

  // ── Encabezados ───────────────────────────────────────────────────────────

  function renderGroupHeaders() {
    const groups: { label: string; bg: string; textColor: string; width: number }[] = [];
    for (const slot of slots) {
      const g    = groupMap[slot.group];
      const last = groups[groups.length - 1];
      if (last && last.label === (g?.label ?? '')) {
        last.width += slot.width;
      } else {
        groups.push({ ...(g ?? { label: '', bg: '#E5E7EB', textColor: '#374151' }), width: slot.width });
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
          <Text style={[styles.groupText, { color: '#5B21B6' }]}>BH · DH · E · S</Text>
        </View>
      </View>
    );
  }

  function renderColHeaders() {
    return (
      <View style={[styles.row, { height: HEADER_H }]}>
        {slots.map((slot) => {
          const active  = resolveActive(slot, overrides);
          const isInterchangeable = !slot.isTotal && !slot.isTA && !slot.readOnly
            && (slot.group === 'ing' || slot.group === 'egr');
          const bg = groupMap[slot.group]?.bg ?? '#E5E7EB';
          return (
            <TouchableOpacity
              key={slot.key}
              onLongPress={isInterchangeable ? () => showSwapMenu(slot) : undefined}
              delayLongPress={400}
              activeOpacity={isInterchangeable ? 0.6 : 1}
              style={[styles.colHeader, { width: slot.width, backgroundColor: bg }]}
            >
              <Text style={styles.colHeaderText} numberOfLines={2}>
                {displayLabel(slot)}{isInterchangeable ? ' ⇌' : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
        <View style={[styles.colHeader, { width: BLOCK_W, backgroundColor: '#EDE9FE', borderLeftWidth: 3, borderLeftColor: '#7C3AED' }]}>
          <Text style={[styles.colHeaderText, { color: '#5B21B6' }]}>
            PI ~{piRef4h} mL/4h
          </Text>
        </View>
      </View>
    );
  }

  // ── Filas de datos ────────────────────────────────────────────────────────

  function renderDataRow(row: TableRow, rowIndex: number) {
    return (
      <View key={rowIndex} style={[styles.row, { height: ROW_H }]}>
        {slots.map((slot, i) => {
          const active = activeCols[i];
          const bg = slot.readOnly
            ? '#EFF6FF'
            : (groupMap[slot.group]?.cellBg ?? '#fff');

          if (slot.isTotal) {
            const sum      = groupRowTotal(row, slot.group, slots);
            const totalBg  = groupMap[slot.group]?.bg ?? '#E5E7EB';
            return (
              <View key={slot.key} style={[styles.cell, { width: slot.width, backgroundColor: totalBg }]}>
                <Text style={styles.totalCellVal}>{sum > 0 ? sum.toFixed(0) : ''}</Text>
              </View>
            );
          }

          return (
            <TableCell
              key={slot.key}
              value={(row as any)[active.key]}
              fieldName={active.label}
              isTA={active.isTA}
              readOnly={active.readOnly}
              frozen={!!selRect}
              style={{ width: slot.width, backgroundColor: bg }}
              onCommit={(v) => onUpdateCell(rowIndex, active.key, v)}
              onLongPressCell={!active.readOnly ? () => {
                const drag: DragSelection = { anchorRow: rowIndex, anchorColIdx: i, curRow: rowIndex, curColIdx: i };
                dragSelRef.current = drag;
                setSelRect({ ...drag });
              } : undefined}
              onTripleTap={!selRect && !interaction && !active.readOnly
                ? () => onUpdateCell(rowIndex, active.key, '')
                : undefined}
            />
          );
        })}
      </View>
    );
  }

  // ── Panel de bloques ─────────────────────────────────────────────────────

  function renderBlockPanel() {
    return (
      <View style={[styles.blockPanel, { width: BLOCK_W }]}>
        {allBlocks.map((b) => {
          const isDisabled = disabled.includes(b.blockIndex);
          const numRows = Math.min(4, rows.length - b.blockIndex * 4);
          const cellH  = numRows * ROW_H;
          const TIME_H = 16;
          const pos     = b.bh >= 0;

          const metrics = [
            { label: 'BH', val: (pos ? '+' : '') + b.bh.toFixed(2), color: pos ? '#DC2626' : '#059669' },
            { label: 'DH', val: b.dh.toFixed(2),                    color: '#1D4ED8' },
            { label: 'E',  val: b.e.toFixed(2),                     color: '#065F46' },
            { label: 'S',  val: b.s.toFixed(2),                     color: '#92400E' },
          ];
          if (b.mant != null) {
            const diff = b.e - b.mant; // lo administrado vs lo esperado
            metrics.push(
              { label: 'M',   val: b.mant.toFixed(2),                              color: '#7C3AED' },
              { label: 'E−M', val: (diff >= 0 ? '+' : '') + diff.toFixed(2), color: diff >= 0 ? '#DC2626' : '#059669' },
            );
          }
          const metricH = Math.floor((cellH - TIME_H) / metrics.length);

          return (
            <TouchableOpacity
              key={b.blockIndex}
              onLongPress={() => confirmToggleBlock(b.blockIndex)}
              delayLongPress={500}
              activeOpacity={0.85}
              style={[
                styles.blockCell,
                { height: cellH },
                isDisabled && styles.blockCellDisabled,
              ]}
            >
              {isDisabled ? (
                <View style={styles.blockDisabledOverlay}>
                  <Text style={styles.blockDisabledLabel}>{formatHora(b.startHora, tf)}</Text>
                  <Text style={styles.blockDisabledSub}>desactivado</Text>
                  <TouchableOpacity
                    style={styles.blockEnableBtn}
                    onPress={() => onToggleBlock(b.blockIndex)}
                  >
                    <Text style={styles.blockEnableBtnText}>↺ Activar</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={[styles.blockTimeRow, { height: TIME_H }]}>
                    <Text style={styles.blockTimeText}>{formatHora(b.startHora, tf)}</Text>
                    <TouchableOpacity
                      style={styles.blockDisableBtn}
                      onPress={() => onToggleBlock(b.blockIndex)}
                      hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
                    >
                      <Text style={styles.blockDisableBtnText}>⊘</Text>
                    </TouchableOpacity>
                  </View>
                  {metrics.map(({ label, val, color }) => (
                    <View key={label} style={[styles.blockMetricRow, { height: metricH }]}>
                      <Text style={styles.blockMetricKey}>{label}</Text>
                      <Text style={[styles.blockMetricVal, { color }]} numberOfLines={1}>{val}</Text>
                    </View>
                  ))}
                </>
              )}
            </TouchableOpacity>
          );
        })}

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
      </View>
    );
  }

  // ── Fila de totales ───────────────────────────────────────────────────────

  function renderTotalsRow() {
    return (
      <View style={[styles.row, styles.totalsRow, { height: ROW_H }]}>
        {slots.map((slot, i) => {
          const active = activeCols[i];
          if (slot.isTA || active.readOnly) {
            return <View key={slot.key} style={[styles.cell, { width: slot.width }]} />;
          }

          if (active.group === 'sv') {
            const vals = rows
              .map(row => (row as any)[active.key])
              .filter((v): v is number => typeof v === 'number');
            const avg = vals.length > 0
              ? vals.reduce((a, b) => a + b, 0) / vals.length
              : null;
            return (
              <View key={slot.key} style={[styles.cell, { width: slot.width }]}>
                {avg !== null
                  ? <Text style={styles.totalVal}>{parseFloat(avg.toFixed(2)).toString()}</Text>
                  : null}
              </View>
            );
          }

          const colSum = rows.reduce((acc, row) => {
            if (slot.isTotal) return acc + groupRowTotal(row, slot.group, slots);
            return acc + ((row as any)[active.key] ?? 0);
          }, 0);
          return (
            <View key={slot.key} style={[styles.cell, { width: slot.width }]}>
              {colSum > 0
                ? <Text style={styles.totalVal}>{colSum.toFixed(0)}</Text>
                : null}
            </View>
          );
        })}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.screen}>
      <StatusBar hidden />

      {/* Barra superior */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.btnBack}>
          <Text style={styles.btnBackText}>← Volver</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onUndo} disabled={!canUndo} style={[styles.btnHistory, !canUndo && styles.btnHistoryDisabled]}>
          <Text style={styles.btnHistoryText}>↩</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onRedo} disabled={!canRedo} style={[styles.btnHistory, !canRedo && styles.btnHistoryDisabled]}>
          <Text style={styles.btnHistoryText}>↪</Text>
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerCama}>Cama {patient.cama}{scTag ? <Text style={styles.headerTag}>  {scTag}</Text> : null}</Text>
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
        {mantDia != null && (
          <View style={styles.headerStats}>
            <Text style={styles.headerMantVal}>{mantDia.toFixed(0)} mL</Text>
            <Text style={styles.headerStatLabel}>Mant. 24h</Text>
          </View>
        )}
        <TouchableOpacity style={styles.btnEdit} onPress={openEdit}>
          <Text style={styles.btnEditText}>✎ Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnExport} onPress={onExport}>
          <Text style={styles.btnExportText}>↑ Compartir</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tabla ── */}
      <View style={styles.tableContainer}>

        {/* Encabezados sticky */}
        <View style={styles.stickyHeaders}>
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

        {/* Datos */}
        <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ flex: 1 }}>
          <View style={styles.dataArea}>

            {/* Columna fija — zona de gestos (no hay scroll horizontal aquí) */}
            <GestureDetector gesture={combinedGesture}>
              <View style={styles.fixedDataCol}>
                {rows.map((row, i) => (
                  <View key={i} style={[styles.row, { height: ROW_H, backgroundColor: i % 2 !== 0 ? '#EAECEF' : '#F3F4F6' }]}>
                    <View style={[styles.fixedCell, { width: FIXED_N_W }]}>
                      <Text style={styles.fixedCellText}>{i + 1}</Text>
                    </View>
                    <View style={[styles.fixedCell, { width: FIXED_HORA_W }]}>
                      <Text style={styles.fixedCellText}>{formatHora(row.hora, tf)}</Text>
                    </View>
                  </View>
                ))}
                <View style={[styles.row, styles.totalsRow, { height: ROW_H }]}>
                  <View style={[styles.fixedCell, { width: FIXED_N_W }]} />
                  <View style={[styles.fixedCell, { width: FIXED_HORA_W }]}>
                    <Text style={[styles.fixedCellText, { fontWeight: '800', fontSize: 10 }]}>TOT.</Text>
                  </View>
                </View>
              </View>
            </GestureDetector>

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
                <View style={{ width: DATA_W }} collapsable={false}>
                  {rows.map((row, i) => renderDataRow(row, i))}
                  {renderTotalsRow()}
                  {selRect && (() => {
                    const cMin = Math.min(selRect.anchorColIdx, selRect.curColIdx);
                    const cMax = Math.max(selRect.anchorColIdx, selRect.curColIdx);
                    const rMin = Math.min(selRect.anchorRow, selRect.curRow);
                    const rMax = Math.max(selRect.anchorRow, selRect.curRow);
                    const x = slots.slice(0, cMin).reduce((a, s) => a + s.width, 0);
                    const w = slots.slice(cMin, cMax + 1).reduce((a, s) => a + s.width, 0);
                    const overlayTop = rMin * ROW_H;
                    const overlayH   = (rMax - rMin + 1) * ROW_H;
                    return (
                      <>
                        <View pointerEvents="none" style={[
                          styles.selectionOverlay,
                          { left: x, top: overlayTop, width: w, height: overlayH },
                        ]} />
                        <GestureDetector gesture={handlePanGesture}>
                          <View style={[styles.selectionHandle, { left: x + w - 10, top: overlayTop + overlayH - 10 }]} />
                        </GestureDetector>
                      </>
                    );
                  })()}
                </View>
                {renderBlockPanel()}
              </View>
            </ScrollView>

          </View>
        </ScrollView>

      </View>
      {/* ── Barra de selección activa (celda única) ── */}
      {selRect && !interaction && (
        <View style={iStyles.bar}>
          <Text style={iStyles.info} numberOfLines={1}>
            Celda seleccionada · arrastra ◼ para extender
          </Text>
          <TouchableOpacity
            style={iStyles.btnConfirm}
            onPress={() => {
              const col = activeCols[selRect.anchorColIdx];
              if (col) onUpdateCell(selRect.anchorRow, col.key, '');
              cancelInteraction();
            }}
          >
            <Text style={iStyles.btnConfirmText}>Limpiar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={iStyles.btnCancel} onPress={cancelInteraction}>
            <Text style={iStyles.btnCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Barra de selección ambigua ── */}
      {interaction && (
        <View style={iStyles.bar}>
          <Text style={iStyles.info} numberOfLines={1}>
            <Text style={iStyles.value}>"{interaction.srcValue}"</Text>
            {` → ${interaction.selected.length} celda${interaction.selected.length > 1 ? 's' : ''} mixtas`}
          </Text>
          <TouchableOpacity
            style={iStyles.btnSecondary}
            onPress={() => { executeAction('copy', interaction, rows); cancelInteraction(); }}
          >
            <Text style={iStyles.btnSecondaryText}>Solo vacías</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={iStyles.btnConfirm}
            onPress={() => { executeAction('replace', interaction, rows); cancelInteraction(); }}
          >
            <Text style={iStyles.btnConfirmText}>Reemplazar todo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={iStyles.btnCancel} onPress={cancelInteraction}>
            <Text style={iStyles.btnCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de intercambio / etiqueta de una sola columna */}
      <Modal visible={!!swapMenuSlotKey} transparent animationType="fade" onRequestClose={() => setSwapMenuSlotKey(null)}>
        <TouchableOpacity style={swapStyles.overlay} activeOpacity={1} onPress={() => setSwapMenuSlotKey(null)}>
          <ScrollView
            style={swapStyles.sheet}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {swapMenuSlotKey && (() => {
              const slot = slots.find(s => s.key === swapMenuSlotKey);
              if (!slot) return null;
              const groupDef    = groupMap[slot.group];
              const activeKey   = overrides[slot.key];
              const activeCol   = resolveActive(slot, overrides);
              const hasCustomLabel = !!colLabels[slot.key];
              return (
                <>
                  <Text style={swapStyles.title}>{slot.label}</Text>
                  <Text style={swapStyles.subtitle}>{groupDef?.label ?? slot.group} · Columna activa · Etiqueta</Text>
                  {/* Alternativas (solo si tiene) */}
                  {(slot.alternates?.length ?? 0) > 0 && (
                    <>
                      <TouchableOpacity
                        style={[swapStyles.option, !activeKey && swapStyles.optionSelected]}
                        onPress={() => onColOverride(slot.key, null)}
                      >
                        <Text style={[swapStyles.optionText, !activeKey && swapStyles.optionTextSelected]}>
                          {slot.label}{!activeKey ? '  ✓' : ''}
                        </Text>
                      </TouchableOpacity>
                      {(slot.alternates ?? []).map(alt => {
                        const isCurrent = activeKey === alt.key;
                        return (
                          <TouchableOpacity
                            key={alt.key}
                            style={[swapStyles.option, isCurrent && swapStyles.optionSelected]}
                            onPress={() => onColOverride(slot.key, alt.key)}
                          >
                            <Text style={[swapStyles.optionText, isCurrent && swapStyles.optionTextSelected]}>
                              {alt.label}{isCurrent ? '  ✓' : ''}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </>
                  )}
                  {/* Etiqueta personalizada */}
                  <View style={swapStyles.labelRow}>
                    <TextInput
                      style={swapStyles.labelInput}
                      placeholder={activeCol.label}
                      placeholderTextColor="#9CA3AF"
                      value={labelDrafts[slot.key] ?? ''}
                      onChangeText={v => setLabelDrafts(prev => ({ ...prev, [slot.key]: v }))}
                      maxLength={20}
                    />
                    <TouchableOpacity
                      style={swapStyles.labelBtn}
                      onPress={() => {
                        const v = (labelDrafts[slot.key] ?? '').trim();
                        if (v) onColLabelChange(slot.key, v);
                      }}
                    >
                      <Text style={swapStyles.labelBtnText}>✓</Text>
                    </TouchableOpacity>
                  </View>
                  {hasCustomLabel && (
                    <TouchableOpacity
                      style={swapStyles.optionRestore}
                      onPress={() => {
                        onColLabelChange(slot.key, null);
                        setLabelDrafts(prev => ({ ...prev, [slot.key]: '' }));
                      }}
                    >
                      <Text style={swapStyles.optionRestoreText}>↺ Restaurar etiqueta por defecto</Text>
                    </TouchableOpacity>
                  )}
                  {/* Limpiar columna activa */}
                  <TouchableOpacity
                    style={swapStyles.optionDelete}
                    onPress={() => {
                      onBatchUpdateCells(
                        rows.map((_, i) => ({ rowIndex: i, colKey: activeCol.key, raw: '' }))
                      );
                    }}
                  >
                    <Text style={swapStyles.optionDeleteText}>⊘ Limpiar "{activeCol.label}"</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={swapStyles.btnCancel} onPress={() => setSwapMenuSlotKey(null)}>
                    <Text style={swapStyles.btnCancelText}>Cerrar</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </ScrollView>
        </TouchableOpacity>
      </Modal>

      {/* Modal de edición de información del paciente */}
      <Modal visible={showEdit} transparent animationType="slide">
        <KeyboardAvoidingView
          style={editStyles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView style={editStyles.sheet} keyboardShouldPersistTaps="handled">
            <Text style={editStyles.title}>Editar expediente</Text>
            <Text style={editStyles.hospital}>{hospital.name} · {table.name}</Text>

            <EditField label="N° Cama *"   value={editCama}     onChange={setEditCama} />
            <EditField label="Peso (kg) *" value={editPeso}     onChange={setEditPeso}     keyboardType="decimal-pad" />
            {editPeso ? (
              <Text style={editStyles.scPreview}>SC ≈ {calcSC(Number(editPeso), table, Number(editTalla) || undefined).toFixed(2)} m²{scDetalle(Number(editPeso), table, Number(editTalla) || undefined) ? ` · ${scDetalle(Number(editPeso), table, Number(editTalla) || undefined)}` : ''}</Text>
            ) : null}
            {(pf?.nombre   ?? 'optional') !== 'hidden' && (
              <EditField label="Nombre / Iniciales" value={editNombre}   onChange={setEditNombre} />
            )}
            {(pf?.edad     ?? 'optional') !== 'hidden' && (
              <EditField label="Edad"               value={editEdad}     onChange={setEditEdad}     keyboardType="numeric" />
            )}
            {(pf?.registro ?? 'optional') !== 'hidden' && (
              <EditField label="N° Registro"        value={editRegistro} onChange={setEditRegistro} />
            )}
            {(pf?.talla    ?? 'optional') !== 'hidden' && (
              <EditField label="Talla (cm)"         value={editTalla}    onChange={setEditTalla}    keyboardType="decimal-pad" />
            )}

            <View style={editStyles.field}>
              <Text style={editStyles.fieldLabel}>Inicio del balance (24h fijo)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 6, paddingVertical: 4 }}>
                  {Array.from({ length: 24 }, (_, i) => {
                    const h24 = `${String(i).padStart(2, '0')}:00`;
                    const sel = editStartHora === h24;
                    const label = tf === '24h'
                      ? String(i).padStart(2, '0')
                      : `${i % 12 || 12}${i < 12 ? 'a' : 'p'}`;
                    return (
                      <TouchableOpacity
                        key={i}
                        onPress={() => setEditStartHora(h24)}
                        style={[editStyles.hourChip, sel && editStyles.hourChipSel]}
                      >
                        <Text style={[editStyles.hourChipText, sel && editStyles.hourChipTextSel]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>

            <View style={editStyles.actions}>
              <TouchableOpacity style={editStyles.btnCancel} onPress={() => setShowEdit(false)}>
                <Text style={editStyles.btnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={editStyles.btnSave} onPress={saveEdit}>
                <Text style={editStyles.btnSaveText}>Guardar</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: 24 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Campo de edición inline ──────────────────────────────────────────────────

function EditField({ label, value, onChange, keyboardType = 'default' }: {
  label: string; value: string; onChange: (v: string) => void;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
}) {
  return (
    <View style={editStyles.field}>
      <Text style={editStyles.fieldLabel}>{label}</Text>
      <TextInput
        style={editStyles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize="characters"
        placeholderTextColor="#9CA3AF"
      />
    </View>
  );
}

const editStyles = StyleSheet.create({
  overlay:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:         { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  title:         { fontSize: 17, fontWeight: '700', color: '#111827', marginBottom: 2 },
  hospital:      { fontSize: 12, color: '#6B7280', marginBottom: 14 },
  scPreview:     { fontSize: 12, color: '#2563EB', textAlign: 'right', marginBottom: 4 },
  field:         { marginBottom: 10 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#6B7280', marginBottom: 4 },
  fieldInput:    { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, color: '#111827', backgroundColor: '#F9FAFB' },
  hourChip:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  hourChipSel:     { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  hourChipText:    { fontSize: 11, color: '#374151', fontVariant: ['tabular-nums'] },
  hourChipTextSel: { color: '#fff', fontWeight: '700' },
  actions:         { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnCancel:     { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' },
  btnCancelText: { color: '#6B7280', fontWeight: '600' },
  btnSave:       { flex: 1, paddingVertical: 12, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center' },
  btnSaveText:   { color: '#fff', fontWeight: '700' },
});

// ─── Estilos de la barra de interacción ──────────────────────────────────────

const iStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#2D3748', paddingHorizontal: 12, paddingVertical: 7,
    borderTopWidth: 1, borderTopColor: '#4A5568',
  },
  info:             { flex: 1, color: '#CBD5E1', fontSize: 11 },
  value:            { color: '#90CDF4', fontWeight: '600' },
  btnSecondary:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#4A5568' },
  btnSecondaryText: { color: '#A0AEC0', fontWeight: '600', fontSize: 11 },
  btnCancel:        { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, backgroundColor: '#4A5568' },
  btnCancelText:    { color: '#E2E8F0', fontWeight: '600', fontSize: 11 },
  btnConfirm:       { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 6, backgroundColor: '#3182CE' },
  btnConfirmText:   { color: '#fff', fontWeight: '700', fontSize: 11 },
});

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1E3A5F', gap: 10,
  },
  btnBack:            { paddingHorizontal: 6, paddingVertical: 4 },
  btnBackText:        { color: '#93C5FD', fontSize: 13, fontWeight: '600' },
  btnHistory:         { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.1)' },
  btnHistoryDisabled: { opacity: 0.3 },
  btnHistoryText:     { color: '#fff', fontSize: 16 },
  headerInfo:         { flex: 1 },
  headerCama:         { color: '#fff',    fontSize: 15, fontWeight: '800' },
  headerNombre:       { color: '#CBD5E1', fontSize: 11 },
  headerMeta:         { color: '#94A3B8', fontSize: 10 },
  headerTag:          { color: '#FBBF24', fontSize: 11, fontWeight: '700' },
  headerDate:         { color: '#64748B', fontSize: 9, marginTop: 1 },
  headerStats:        { alignItems: 'flex-end' },
  headerBHVal:        { fontSize: 18, fontWeight: '900' },
  headerDHVal:        { fontSize: 14, fontWeight: '700', color: '#93C5FD' },
  headerMantVal:      { fontSize: 14, fontWeight: '700', color: '#C4B5FD' },
  headerStatLabel:    { color: '#94A3B8', fontSize: 9 },
  btnEdit:            { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnEditText:        { color: '#fff', fontWeight: '700', fontSize: 12 },
  btnExport:          { backgroundColor: '#25D366', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  btnExportText:      { color: '#fff', fontWeight: '700', fontSize: 12 },

  tableContainer: { flex: 1, flexDirection: 'column' },

  stickyHeaders: {
    flexDirection: 'row',
    height: GROUP_H + HEADER_H,
  },
  fixedColBlock: {
    width: FIXED_W,
    backgroundColor: '#F3F4F6',
    borderRightWidth: 2,
    borderRightColor: '#374151',
    zIndex: 2,
  },

  dataArea:     { flexDirection: 'row' },
  fixedDataCol: {
    width: FIXED_W,
    backgroundColor: '#F3F4F6',
    borderRightWidth: 2,
    borderRightColor: '#374151',
    zIndex: 2,
  },

  fixedGroupRow: {
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#D1D5DB',
  },
  fixedGroupText:  { fontSize: 9, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  fixedColHeader: {
    height: HEADER_H, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 2, borderColor: '#D1D5DB',
  },

  fixedCell: {
    height: ROW_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB',
  },
  fixedCellText: { fontSize: 11, color: '#374151', fontVariant: ['tabular-nums'] },

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

  cell: {
    height: ROW_H, justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#E5E7EB',
  },
  totalCellVal: { fontSize: 10, fontWeight: '700', color: '#065F46', fontVariant: ['tabular-nums'] },

  // ── Panel de bloques ──
  blockPanel: {
    borderLeftWidth: 3, borderLeftColor: '#7C3AED', backgroundColor: '#FAF5FF',
  },
  blockCell: {
    flexDirection: 'column',
    borderBottomWidth: 2, borderBottomColor: '#C4B5FD',
    overflow: 'hidden',
  },
  blockCellDisabled: {
    backgroundColor: '#F3F4F6',
  },
  blockDisabledOverlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 3,
  },
  blockDisabledLabel: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', textAlign: 'center' },
  blockDisabledSub:   { fontSize: 8, color: '#D1D5DB', textAlign: 'center' },
  blockEnableBtn:     { marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, backgroundColor: '#DDD6FE' },
  blockEnableBtnText: { fontSize: 9, color: '#5B21B6', fontWeight: '700' },
  blockTimeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EDE9FE', paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#C4B5FD',
  },
  blockTimeText:    { fontSize: 9, color: '#7C3AED', fontWeight: '700' },
  blockDisableBtn:  { paddingHorizontal: 2 },
  blockDisableBtnText: { fontSize: 10, color: '#A78BFA' },
  blockMetricRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 6,
    borderBottomWidth: 1, borderBottomColor: '#EDE9FE',
  },
  blockMetricKey: { fontSize: 9, fontWeight: '700', color: '#6B7280', width: 24 },
  blockMetricVal: { fontSize: 12, fontWeight: '800', flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] },
  blockTotals: {
    flexDirection: 'row', backgroundColor: '#EDE9FE',
    borderTopWidth: 2, borderTopColor: '#7C3AED',
    paddingHorizontal: 4, alignItems: 'center',
  },
  blockTotRow: { flex: 1, alignItems: 'center' },
  blockTotKey: { fontSize: 8, fontWeight: '700', color: '#374151' },
  blockTotVal: { fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },

  // ── Totales ──
  totalVal:  { fontSize: 10, fontWeight: '800', color: '#1E3A5F', fontVariant: ['tabular-nums'] },
  totalsRow: { backgroundColor: '#EFF6FF', borderTopWidth: 2, borderTopColor: '#2563EB' },

  // ── Overlay de selección ──
  selectionOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(37, 99, 235, 0.18)',
    borderWidth: 2,
    borderColor: '#2563EB',
    borderRadius: 2,
  },
  selectionHandle: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    borderWidth: 2,
    borderColor: '#fff',
    zIndex: 10,
  },
});

const swapStyles = StyleSheet.create({
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  sheet:               { backgroundColor: '#fff', borderRadius: 14, padding: 16, width: 260, maxHeight: '80%' },
  title:               { fontSize: 15, fontWeight: '700', color: '#111827', textAlign: 'center' },
  subtitle:            { fontSize: 11, color: '#6B7280', textAlign: 'center', marginBottom: 8 },
  option:              { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#F3F4F6', marginBottom: 6 },
  optionSelected:      { backgroundColor: '#DBEAFE' },
  optionText:          { fontSize: 13, color: '#374151', fontWeight: '500', textAlign: 'center' },
  optionTextSelected:  { color: '#1D4ED8', fontWeight: '700' },
  optionRestore:       { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#FEF3C7', marginTop: 8 },
  optionRestoreText:   { fontSize: 13, color: '#92400E', fontWeight: '600', textAlign: 'center' },
  optionDelete:        { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#FEE2E2', marginTop: 8 },
  optionDeleteText:    { fontSize: 13, color: '#B91C1C', fontWeight: '600', textAlign: 'center' },
  btnCancel:           { paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 2 },
  btnCancelText:       { color: '#6B7280', fontWeight: '600', textAlign: 'center' },
  labelRow:            { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  labelInput:          { flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, color: '#111827', backgroundColor: '#F9FAFB' },
  labelBtn:            { backgroundColor: '#2563EB', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  labelBtnText:        { color: '#fff', fontSize: 13, fontWeight: '700' as const },
});
