import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import type { RootStackParamList } from '../types/navigation';
import type { TripMessage } from '../types';
import { colors, fontFamily, radii, spacing, typography } from '../constants/theme';
import { useTripsContext } from '../context/TripsContext';
import { useAuthContext } from '../context/AuthContext';
import { useTripMessages } from '../hooks/useTripMessages';
import { Icon } from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'TripChat'> & {
  /**
   * Distance from the top of the screen to the top of this component, so the
   * keyboard-avoiding composer pushes up by the right amount. Defaults to the
   * standalone screen's own native header height — pass the extra height of
   * whatever's rendered above this when embedding it (e.g. TripDetailScreen's
   * Chat tab, which sits below its own header + tab bar).
   */
  keyboardVerticalOffset?: number;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  const dow = d.toLocaleDateString(undefined, { weekday: 'short' });
  return `${dow} ${time}`;
}

// ── main screen ───────────────────────────────────────────────────────────────

export default function TripChatScreen({ route, keyboardVerticalOffset }: Props) {
  // Exact native header height for this screen's own stack context — precise
  // fallback for standalone use. Pass keyboardVerticalOffset explicitly when
  // embedding this screen below extra chrome (see the Props doc comment).
  const nativeHeaderHeight = useHeaderHeight();
  const effectiveKeyboardOffset = keyboardVerticalOffset ?? (Platform.OS === 'ios' ? nativeHeaderHeight : 0);
  const { tripId } = route.params;
  const { trips } = useTripsContext();
  const { currentUser } = useAuthContext();
  const { messages, loading, sendMessage } = useTripMessages(tripId);

  const trip = useMemo(() => trips.find((t) => t.id === tripId) ?? null, [trips, tripId]);

  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<TripMessage>>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
  }, [messages.length]);

  const canSend = text.trim().length > 0;

  const handleSend = useCallback(async () => {
    if (!currentUser || !canSend || sending) return;
    setSending(true);
    try {
      await sendMessage(
        text.trim(),
        currentUser.uid,
        currentUser.displayName ?? currentUser.email ?? 'Unknown'
      );
      setText('');
    } finally {
      setSending(false);
    }
  }, [currentUser, canSend, sending, sendMessage, text]);

  // ── render helpers ────────────────────────────────────────────────────────

  const renderMessage = ({ item }: { item: TripMessage }) => {
    const isMine = item.senderUid === currentUser?.uid;
    return (
      <View style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
        {!isMine && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.senderName?.[0]?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={[styles.bubbleWrapper, isMine ? styles.bubbleWrapperMine : undefined]}>
          {!isMine && (
            <Text style={styles.senderName}>{item.senderName}</Text>
          )}
          <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
            {!!item.text && (
              <Text style={[styles.bubbleText, isMine ? styles.bubbleTextMine : undefined]}>
                {item.text}
              </Text>
            )}
          </View>
          <Text style={[styles.timestamp, isMine ? styles.timestampMine : undefined]}>
            {formatTimestamp(item.createdAt)}
          </Text>
        </View>
      </View>
    );
  };

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Trip not found.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={effectiveKeyboardOffset}
    >
      {/* ── Message list ───────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : messages.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="message-circle" size={48} color={colors.borderStrong} />
          <Text style={styles.emptyTitle}>No messages yet</Text>
          <Text style={styles.emptySubtitle}>Be the first to say something!</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => listRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {/* ── Compose ────────────────────────────────────────────────── */}
      <View style={styles.compose}>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
          />
          <Pressable style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]} onPress={handleSend} disabled={!canSend || sending}>
            {sending
              ? <ActivityIndicator size="small" color={colors.textInverse} />
              : <Icon name="arrow-up" size={18} color={colors.textInverse} />
            }
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ── styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surfacePage,
  },

  // Empty / loading states
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.space2,
    paddingHorizontal: spacing.space9,
  },
  emptyTitle: {
    ...typography.titleMd,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  emptySubtitle: {
    ...typography.bodySm,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Message list
  listContent: {
    paddingHorizontal: spacing.space3,
    paddingTop: spacing.space3,
    paddingBottom: spacing.space2,
    gap: spacing.space2,
  },

  // Message row
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.space2,
  },
  messageRowMine: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },

  // Avatar (others only)
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: {
    color: colors.textInverse,
    fontSize: 13,
    fontFamily: fontFamily.bodyBold,
  },

  // Bubble wrapper
  bubbleWrapper: {
    maxWidth: '75%',
    gap: 3,
  },
  bubbleWrapperMine: {
    alignItems: 'flex-end',
  },
  senderName: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: 4,
    marginBottom: 1,
  },

  // Bubble
  bubble: {
    borderRadius: radii.md,
    paddingHorizontal: spacing.space3,
    paddingVertical: spacing.space2,
    gap: 6,
  },
  bubbleMine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    ...typography.bodySm,
    color: colors.textPrimary,
  },
  bubbleTextMine: {
    color: colors.textInverse,
  },

  // Timestamp
  timestamp: {
    ...typography.caption,
    color: colors.textTertiary,
    paddingHorizontal: 4,
  },
  timestampMine: {
    textAlign: 'right',
  },

  // Compose bar
  compose: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surfacePage,
    paddingBottom: Platform.OS === 'ios' ? 4 : 8,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.space2,
    paddingVertical: spacing.space2,
    gap: spacing.space2,
  },
  textInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.space4,
    paddingVertical: 9,
    fontFamily: fontFamily.body,
    fontSize: typography.bodySm.fontSize,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceCard,
    maxHeight: 100,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.borderStrong,
  },
});
