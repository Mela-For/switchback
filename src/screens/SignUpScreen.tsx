import { useState } from 'react';
import { StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types/navigation';
import { colors, fontFamily, spacing, typography } from '../constants/theme';
import { useAuthContext } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export default function SignUpScreen({ navigation }: Props) {
  const { signUp } = useAuthContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignUp = async () => {
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    if (!email.trim()) { setError('Please enter your email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Plan your first trip in seconds</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Input
          label="Your name"
          icon="user"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Alex"
          autoCapitalize="words"
        />

        <Input
          label="Email"
          icon="mail"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <Input
          label="Password"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          secureTextEntry
          textContentType="oneTimeCode"
        />

        <Button size="lg" style={styles.button} onPress={handleSignUp} disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>

        <Pressable style={styles.link} onPress={() => navigation.navigate('SignIn')}>
          <Text style={styles.linkText}>
            Already have an account? <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled. Enable it in Firebase Console → Authentication → Sign-in method.';
    case 'auth/invalid-api-key':
      return 'Invalid Firebase API key. Check your config in src/firebase/config.ts.';
    case 'auth/network-request-failed':
      return 'Network error. Check your internet connection.';
    default:
      return `Sign-up failed (${code ?? 'unknown error'}). Check your Firebase config and Console settings.`;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfacePage },
  content: { padding: spacing.space7, paddingTop: 72, gap: spacing.space4 },
  title: { ...typography.displayMd, color: colors.textPrimary },
  subtitle: { ...typography.bodyLg, color: colors.textSecondary, marginBottom: spacing.space3 },
  error: {
    ...typography.bodySm,
    fontFamily: fontFamily.bodySemiBold,
    backgroundColor: colors.clay200,
    color: colors.clay600,
    padding: spacing.space3,
    borderRadius: 8,
  },
  button: { marginTop: spacing.space4 },
  link: { alignItems: 'center', marginTop: spacing.space5 },
  linkText: { ...typography.bodyMd, color: colors.textSecondary },
  linkBold: { fontFamily: fontFamily.bodySemiBold, color: colors.primary },
});
