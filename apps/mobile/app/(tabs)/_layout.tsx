import React from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { BookOpen, Library, Swords, User } from 'lucide-react-native';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { hapticSelect } from '@/services/haptics';

export default function TabsLayout() {
  const { colors, typography } = useRakuTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.line,
          borderTopWidth: StyleSheet.hairlineWidth
        },
        tabBarLabelStyle: {
          fontFamily: typography.fontFamily.viNative.medium,
          fontSize: 11
        }
      }}
      screenListeners={{
        tabPress: () => hapticSelect()
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Học',
          tabBarIcon: ({ color, size }) => <BookOpen size={size - 2} color={color} />
        }}
      />
      <Tabs.Screen
        name="library"
        options={{
          title: 'Kho học',
          tabBarIcon: ({ color, size }) => <Library size={size - 2} color={color} />
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: 'Luyện tập',
          tabBarIcon: ({ color, size }) => <Swords size={size - 2} color={color} />
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Hồ sơ',
          tabBarIcon: ({ color, size }) => <User size={size - 2} color={color} />
        }}
      />
    </Tabs>
  );
}
