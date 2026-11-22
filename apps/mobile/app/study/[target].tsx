import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRakuTheme } from '@/providers/ThemeProvider';
import { useStudy } from '@/providers/StudyProvider';
import { FlashcardSession } from '@/components/FlashcardSession';
import { stopJapaneseSpeech } from '@/services/speech';

export default function FocusStudyScreen() {
  const router = useRouter();
  const { colors } = useRakuTheme();
  const { buildQueueForTarget, rateCard, recordStudySeconds } = useStudy();
  const params = useLocalSearchParams<{ target?: string; extra?: string }>();

  const targetKey = typeof params.target === 'string' ? params.target : 'today';
  const initialExtra = typeof params.extra === 'string' ? Number(params.extra) || 0 : 0;

  const [extraQuota, setExtraQuota] = useState(initialExtra);
  const [sessionNonce, setSessionNonce] = useState(0);

  const session = useMemo(
    () => buildQueueForTarget(targetKey, extraQuota),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetKey, extraQuota, sessionNonce]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      recordStudySeconds(1);
    }, 1000);

    return () => {
      clearInterval(timer);
      stopJapaneseSpeech();
    };
  }, [recordStudySeconds]);

  const handleLoadMoreNew = () => {
    setExtraQuota((prev) => prev + 20);
    setSessionNonce((prev) => prev + 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.canvas }]}>
      <Stack.Screen options={{ title: session.title }} />
      <FlashcardSession
        initialCards={session.cards}
        onRateCard={rateCard}
        onComplete={() => router.back()}
        onLoadMoreNew={handleLoadMoreNew}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  }
});
