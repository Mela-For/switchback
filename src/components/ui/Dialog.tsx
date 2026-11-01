import React from 'react';
import { Modal, Pressable, Text, View, StyleSheet } from 'react-native';
import { colors, radii, shadows, spacing, typography } from '../../constants/theme';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}

export function Dialog({ open, title, children, onClose, footer }: DialogProps) {
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <IconButton icon="x" size="sm" label="Close" onPress={onClose} />
          </View>
          {children ? (
            typeof children === 'string' ? (
              <Text style={styles.bodyText}>{children}</Text>
            ) : (
              <View>{children}</View>
            )
          ) : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.surfaceOverlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.space5,
  },
  box: {
    width: 380,
    maxWidth: '100%',
    backgroundColor: colors.surfaceCard,
    borderRadius: radii.lg,
    padding: spacing.space6,
    gap: spacing.space4,
    ...shadows.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.titleLg, color: colors.textPrimary },
  bodyText: { ...typography.bodyMd, color: colors.textSecondary },
  footer: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
});
