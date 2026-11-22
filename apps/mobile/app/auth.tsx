import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { useRouter } from 'expo-router';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { isFirebaseConfigured } from '@/services/firebase';
import { hapticSelect, hapticSuccess, hapticTap, hapticWarning } from '@/services/haptics';

export default function AuthModalScreen() {
  const router = useRouter();
  const { colors, typography } = useRakuTheme();
  const { user, signInAsGuest, signInWithEmail, registerWithEmail, signOutAccount } = useStudy();

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!isFirebaseConfigured) {
      setError('Chưa cấu hình EXPO_PUBLIC_FIREBASE_API_KEY trong apps/mobile/.env.');
      return;
    }
    if (!email.trim() || password.length < 6) {
      setError('Nhập email hợp lệ và mật khẩu từ 6 ký tự.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (isRegister) {
        await registerWithEmail(email, password);
      } else {
        await signInWithEmail(email, password);
      }
      hapticSuccess();
      router.back();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Không thể xác thực tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    if (!isFirebaseConfigured) {
      setError('Chưa cấu hình Firebase; bạn vẫn học ngoại tuyến hoàn toàn bình thường.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signInAsGuest();
      hapticSuccess();
      router.back();
    } catch (err) {
      hapticWarning();
      setError(err instanceof Error ? err.message : 'Không thể khởi tạo phiên ẩn danh.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async (clearLocal: boolean) => {
    setLoading(true);
    setError(null);
    try {
      await signOutAccount(clearLocal);
      hapticTap();
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng xuất thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.canvas }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {user && !user.isAnonymous ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={[styles.label, { color: colors.muted }]}>Đã đăng nhập</Text>
            <Text
              style={[
                styles.emailValue,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
              ]}
            >
              {user.email}
            </Text>

            {error && <Text style={[styles.errorText, { color: colors.again }]}>{error}</Text>}

            <Pressable
              disabled={loading}
              onPress={() => void handleSignOut(false)}
              style={[styles.secondaryBtn, { borderColor: colors.lineStrong }]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.ink }]}>
                Đăng xuất (giữ dữ liệu trên máy)
              </Text>
            </Pressable>

            <Pressable
              disabled={loading}
              onPress={() => void handleSignOut(true)}
              style={[styles.dangerBtn, { backgroundColor: colors.againSoft }]}
            >
              <Text style={[styles.dangerBtnText, { color: colors.again }]}>
                Đăng xuất và xóa dữ liệu máy
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text
              style={[
                styles.title,
                { color: colors.ink, fontFamily: typography.fontFamily.viNative.bold }
              ]}
            >
              {user?.isAnonymous
                ? 'Liên kết tài khoản Email'
                : isRegister
                  ? 'Tạo tài khoản mới'
                  : 'Đăng nhập Raku'}
            </Text>
            <Text style={[styles.sub, { color: colors.muted }]}>
              Dùng chung tài khoản với bản Web để đồng bộ tiến độ ôn tập FSRS.
            </Text>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Email</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="ban@example.com"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  { backgroundColor: colors.canvas, borderColor: colors.lineStrong, color: colors.ink }
                ]}
              />
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Mật khẩu</Text>
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                placeholder="Ít nhất 6 ký tự"
                placeholderTextColor={colors.muted}
                style={[
                  styles.input,
                  { backgroundColor: colors.canvas, borderColor: colors.lineStrong, color: colors.ink }
                ]}
              />
            </View>

            {error && <Text style={[styles.errorText, { color: colors.again }]}>{error}</Text>}

            <Pressable
              disabled={loading}
              onPress={() => void handleSubmit()}
              style={({ pressed }) => [
                styles.primaryBtn,
                {
                  backgroundColor: pressed ? colors.accentHover : colors.accent,
                  opacity: loading ? 0.6 : 1
                }
              ]}
            >
              {loading ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text
                  style={[
                    styles.primaryBtnText,
                    { color: colors.onAccent, fontFamily: typography.fontFamily.viNative.semibold }
                  ]}
                >
                  {isRegister ? 'Đăng ký' : 'Đăng nhập'}
                </Text>
              )}
            </Pressable>

            {!user && (
              <Pressable
                disabled={loading}
                onPress={() => void handleGuest()}
                style={[styles.secondaryBtn, { borderColor: colors.lineStrong }]}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.ink }]}>
                  Dùng thử ẩn danh
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                hapticSelect();
                setIsRegister((v) => !v);
                setError(null);
              }}
              style={styles.switchModeBtn}
            >
              <Text style={[styles.switchModeText, { color: colors.accent }]}>
                {isRegister ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Tạo mới'}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  content: {
    padding: 16
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14
  },
  title: {
    fontSize: 19
  },
  sub: {
    fontSize: 13,
    lineHeight: 19
  },
  emailValue: {
    fontSize: 16
  },
  field: {
    gap: 6
  },
  label: {
    fontSize: 12,
    fontWeight: '600'
  },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 15
  },
  errorText: {
    fontSize: 12
  },
  primaryBtn: {
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryBtnText: {
    fontSize: 15
  },
  secondaryBtn: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600'
  },
  dangerBtn: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center'
  },
  dangerBtnText: {
    fontSize: 13,
    fontWeight: '600'
  },
  switchModeBtn: {
    alignItems: 'center',
    paddingVertical: 6
  },
  switchModeText: {
    fontSize: 13,
    fontWeight: '600'
  }
});
