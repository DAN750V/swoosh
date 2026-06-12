import { useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

const PHOTO_OPTIONS = [20, 50, 100] as const;
type PhotoOption = (typeof PHOTO_OPTIONS)[number];

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const [selected, setSelected] = useState<PhotoOption | null>(null);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>
            How many photos{'\n'}would you like to{'\n'}review a day?
          </Text>
          <Text style={styles.subtitle}>
            We'll queue up a batch each day for you to sort through.
          </Text>
        </View>

        <View style={styles.cards}>
          {PHOTO_OPTIONS.map((n) => {
            const isSelected = selected === n;
            return (
              <Pressable
                key={n}
                onPress={() => setSelected(n)}
                style={({ pressed }) => [
                  styles.card,
                  isSelected && styles.cardSelected,
                  pressed && !isSelected && styles.cardPressed,
                ]}
              >
                <Text style={[styles.cardNumber, isSelected && styles.cardNumberSelected]}>
                  {n}
                </Text>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                  photos
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() =>
            selected !== null && navigation.navigate('Swipe', { dailyLimit: selected })
          }
          disabled={selected === null}
          style={({ pressed }) => [
            styles.button,
            selected !== null && styles.buttonActive,
            pressed && selected !== null && styles.buttonPressed,
          ]}
        >
          <Text style={[styles.buttonText, selected !== null && styles.buttonTextActive]}>
            Let's go
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const ACCENT = '#ffffff';
const ACCENT_DIM = 'rgba(255,255,255,0.08)';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'center',
    gap: 48,
  },
  header: {
    gap: 12,
  },
  title: {
    color: ACCENT,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -0.5,
    lineHeight: 42,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400',
  },
  cards: {
    flexDirection: 'row',
    gap: 12,
  },
  card: {
    flex: 1,
    aspectRatio: 0.85,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: ACCENT_DIM,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  cardSelected: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  cardPressed: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  cardNumber: {
    color: ACCENT,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
  },
  cardNumberSelected: {
    color: '#0a0a0a',
  },
  cardLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cardLabelSelected: {
    color: 'rgba(10,10,10,0.55)',
  },
  button: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buttonActive: {
    backgroundColor: ACCENT,
  },
  buttonPressed: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  buttonText: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  buttonTextActive: {
    color: '#0a0a0a',
  },
});
