import React, { useState, useRef } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import NumericSlashKeyboard from './NumericSlashKeyboard';

interface Props {
  value?: string | number;
  fieldName?: string;
  isTA?: boolean;
  readOnly?: boolean;
  frozen?: boolean;          // selección activa — taps no abren teclado
  style?: ViewStyle;
  onCommit: (val: string) => void;
  onLongPressCell?: () => void;
  onTripleTap?: () => void;
}

export default function TableCell({
  value,
  fieldName,
  isTA = false,
  readOnly = false,
  frozen = false,
  style,
  onCommit,
  onLongPressCell,
  onTripleTap,
}: Props) {
  const [open, setOpen] = useState(false);
  const display = value !== undefined && value !== '' ? String(value) : '';

  // ── Triple toque: detección manual para no retrasar el toque simple ────────
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handlePress() {
    if (readOnly || frozen) return;

    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);

    if (tapCount.current >= 3) {
      tapCount.current = 0;
      onTripleTap?.();
      return;
    }

    // Esperar 300 ms para detectar si hay más toques
    tapTimer.current = setTimeout(() => {
      const c = tapCount.current;
      tapCount.current = 0;
      if (c === 1) setOpen(true);
    }, 300);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.cell, readOnly && styles.cellReadOnly, style]}
        onPress={handlePress}
        onLongPress={onLongPressCell}
        delayLongPress={400}
        activeOpacity={readOnly || frozen ? 1 : 0.6}
      >
        <Text style={[styles.text, !display && styles.placeholder]} numberOfLines={1}>
          {display || (readOnly ? '' : '·')}
        </Text>
      </TouchableOpacity>

      <NumericSlashKeyboard
        visible={open}
        value={display}
        title={fieldName}
        allowSlash={isTA}
        onConfirm={(v) => { setOpen(false); onCommit(v); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  cell: {
    height: 32,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
  },
  cellReadOnly: {
    backgroundColor: '#EFF6FF',
  },
  text: {
    fontSize: 12,
    color: '#111827',
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    color: '#D1D5DB',
  },
});
