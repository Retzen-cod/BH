import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';

interface Props {
  visible: boolean;
  value: string;
  title?: string;
  allowSlash?: boolean; // false para campos solo numéricos
  onConfirm: (val: string) => void;
  onCancel: () => void;
}

const KEYS_WITH_SLASH = [
  '7', '8', '9',
  '4', '5', '6',
  '1', '2', '3',
  '/', '0', '⌫',
];

const KEYS_NO_SLASH = [
  '7', '8', '9',
  '4', '5', '6',
  '1', '2', '3',
  '.', '0', '⌫',
];

export default function NumericSlashKeyboard({
  visible,
  value,
  title,
  allowSlash = false,
  onConfirm,
  onCancel,
}: Props) {
  const [current, setCurrent] = React.useState(value);

  // Sincronizar cuando el modal se abre con un valor nuevo
  React.useEffect(() => {
    if (visible) setCurrent(value);
  }, [visible, value]);

  const keys = allowSlash ? KEYS_WITH_SLASH : KEYS_NO_SLASH;

  function press(key: string) {
    if (key === '⌫') {
      setCurrent((v) => v.slice(0, -1));
    } else {
      // Solo permitir un '/' o '.'
      if ((key === '/' || key === '.') && current.includes(key)) return;
      setCurrent((v) => v + key);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.container} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}

          {/* Display */}
          <View style={styles.display}>
            <Text style={styles.displayText}>{current || '—'}</Text>
          </View>

          {/* Keys */}
          <View style={styles.grid}>
            {keys.map((k) => (
              <TouchableOpacity
                key={k}
                style={[styles.key, k === '⌫' && styles.keyDelete]}
                onPress={() => press(k)}
                activeOpacity={0.6}
              >
                <Text style={[styles.keyText, k === '⌫' && styles.keyDeleteText]}>
                  {k}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Confirm */}
          <TouchableOpacity
            style={styles.confirm}
            onPress={() => onConfirm(current)}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmText}>✓ Confirmar</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    width: 220,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
  },
  display: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  displayText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 12,
  },
  key: {
    width: 54,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  keyDelete: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  keyDeleteText: {
    color: '#DC2626',
  },
  confirm: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
