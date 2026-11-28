import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { KANJI_BY_CHAR } from '@raku/core';

interface InteractiveJpTextNativeProps {
  text: string;
  style?: StyleProp<TextStyle>;
  kanjiHighlightColor?: string;
  onSelectKanji?: (char: string) => void;
}

/**
 * Renders Japanese text in React Native where known Kanji characters can be tapped
 * to open KanjiBottomSheet.
 */
export function InteractiveJpTextNative({
  text,
  style,
  kanjiHighlightColor,
  onSelectKanji
}: InteractiveJpTextNativeProps) {
  if (!onSelectKanji) {
    return <Text style={style}>{text}</Text>;
  }

  return (
    <Text style={style}>
      {Array.from(text).map((ch, idx) => {
        if (KANJI_BY_CHAR.has(ch)) {
          return (
            <Text
              key={`${ch}_${idx}`}
              onPress={() => onSelectKanji(ch)}
              style={
                kanjiHighlightColor
                  ? { textDecorationLine: 'underline', textDecorationColor: kanjiHighlightColor }
                  : undefined
              }
            >
              {ch}
            </Text>
          );
        }
        return ch;
      })}
    </Text>
  );
}
