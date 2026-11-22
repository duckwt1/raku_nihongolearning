import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import {
  BeVietnamPro_400Regular,
  BeVietnamPro_500Medium,
  BeVietnamPro_600SemiBold,
  BeVietnamPro_700Bold
} from '@expo-google-fonts/be-vietnam-pro';
import {
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold
} from '@expo-google-fonts/zen-kaku-gothic-new';
import { ThemeProvider, useRakuTheme } from '@/providers/ThemeProvider';
import { StudyProvider } from '@/providers/StudyProvider';
import { initHapticsPreference } from '@/services/haptics';

function RootNavigator() {
  const { colors, mode, typography } = useRakuTheme();

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          headerTitleStyle: {
            fontFamily: typography.fontFamily.viNative.semibold,
            fontSize: 16
          },
          contentStyle: { backgroundColor: colors.canvas }
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="study/[target]"
          options={{
            headerBackTitle: 'Học',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen
          name="grammar/[id]"
          options={{
            title: 'Ngữ pháp',
            headerBackTitle: 'Kho học',
            animation: 'slide_from_right'
          }}
        />
        <Stack.Screen
          name="auth"
          options={{
            title: 'Tài khoản',
            presentation: 'modal'
          }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    void initHapticsPreference();
  }, []);

  const [fontsLoaded] = useFonts({
    BeVietnamPro_400Regular,
    BeVietnamPro_500Medium,
    BeVietnamPro_600SemiBold,
    BeVietnamPro_700Bold,
    ZenKakuGothicNew_400Regular,
    ZenKakuGothicNew_500Medium,
    ZenKakuGothicNew_700Bold
  });

  if (!fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#F6F3EB'
        }}
      >
        <ActivityIndicator color="#245C52" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StudyProvider>
            <RootNavigator />
          </StudyProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
