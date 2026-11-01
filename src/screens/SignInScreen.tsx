import { useState } from 'react';
import { StyleSheet, Text, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../types/navigation';
import { colors, fontFamily, spacing, typography } from '../constants/theme';
import { useAuthContext } from '../context/AuthContext';
import { Button, Input } from '../components/ui';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export default function SignInScreen({ navigation }: Props) {
  const { signIn } = useAuthContext();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      setError(friendlyError(e.code));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to access your trips</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Input
          testID="signin-email-input"
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
          testID="signin-password-input"
          label="Password"
          icon="lock"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          textContentType="oneTimeCode"
        />

        <Button testID="signin-submit-button" size="lg" style={styles.button} onPress={handleSignIn} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>

        <Pressable style={styles.link} onPress={() => navigation.navigate('SignUp')}>
          <Text style={styles.linkText}>
            Don&apos;t have an account? <Text style={styles.linkBold}>Sign up</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
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
