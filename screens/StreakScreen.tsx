import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';
import { loadStreak, type StreakData } from '../lib/streak';

type Props = NativeStackScreenProps<RootStackParamList, 'Streak'>;

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export default function StreakScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<StreakData | null>(null);

  useEffect(() => {
    loadStreak().then(setData);
  }, []);

  const count = data?.count ?? 0;
  const weekDays = data?.weekDays ?? Array(7).fill(false);

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.5)" />
        </Pressable>
      </View>

      {/* Streak display — occupies all remaining vertical space and centers content */}
      <View style={styles.body}>
        <Text style={styles.number}>{count}</Text>
        <Text style={styles.label}>day streak</Text>

        {count === 0 && (
          <Text style={styles.hint}>Complete a session to start your streak</Text>
        )}

        {/* Week dots */}
        <View style={styles.week}>
          {DAY_LABELS.map((day, i) => (
            <View key={i} style={styles.dayCell}>
              <View style={[styles.dot, weekDays[i] ? styles.dotFilled : styles.dotEmpty]} />
              <Text style={styles.dayLabel}>{day}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.55 }]}
          onPress={() => navigation.navigate('Onboarding')}
        >
          <Text style={styles.doneBtnText}>Done for today</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    height: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  backBtn: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 28,
  },
  number: {
    color: '#ffffff',
    fontSize: 96,
    fontWeight: '700',
    letterSpacing: -4,
    lineHeight: 100,
  },
  label: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 16,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginBottom: 32,
  },
  hint: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: -20,
    marginBottom: 20,
  },
  week: {
    flexDirection: 'row',
    gap: 18,
  },
  dayCell: {
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  dotFilled: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  dotEmpty: {
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dayLabel: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 11,
    fontWeight: '500',
  },
  footer: {
    paddingHorizontal: 28,
  },
  doneBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 17,
    fontWeight: '500',
  },
});
