import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import NumericSlashKeyboard from './NumericSlashKeyboard';

interface Props {
  value?: string | number;
  fieldName?: string;
  isTA?: boolean;        // usa teclado con '/'
  readOnly?: boolean;
  style?: ViewStyle;
  onCommit: (val: string) => void;
}

export default function TableCell({
  value,
  fieldName,
  isTA = false,
  readOnly = false,
  style,
  onCommit,
}: Props) {
  const [open, setOpen] = useState(false);
  const display = value !== undefined && value !== '' ? String(value) : '';

  function handleConfirm(val: string) {
    setOpen(false);
    onCommit(val);
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.cell, readOnly && styles.cellReadOnly, style]}
        onPress={() => !readOnly && setOpen(true)}
        activeOpacity={readOnly ? 1 : 0.6}
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
        onConfirm={handleConfirm}
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
