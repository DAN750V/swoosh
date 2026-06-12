import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

type Props = NativeStackScreenProps<RootStackParamList, 'Summary'>;

export default function SummaryScreen({ route, navigation }: Props) {
  const { kept, deleted } = route.params;
  const total = kept + deleted;
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.content}>
        <View style={styles.topSection}>
          <Text style={styles.eyebrow}>Today's session</Text>
          <Text style={styles.title}>
            {total} photo{total !== 1 ? 's' : ''}{'\n'}reviewed
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{kept}</Text>
            <View style={styles.statMeta}>
              <Ionicons name="checkmark-circle-outline" size={15} color="rgba(255,255,255,0.35)" />
              <Text style={styles.statLabel}>Kept</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{deleted}</Text>
            <View style={styles.statMeta}>
              <Ionicons name="trash-outline" size={15} color="rgba(255,255,255,0.35)" />
              <Text style={styles.statLabel}>For deletion</Text>
            </View>
          </View>
        </View>

        <View style={styles.buttons}>
          <Pressable
            style={({ pressed }) => [styles.primaryBtn, pressed && styles.primaryBtnPressed]}
          >
            <Text style={styles.primaryBtnText}>Review deletions</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.ghostBtn, pressed && { opacity: 0.5 }]}
            onPress={() => navigation.navigate('Onboarding')}
          >
            <Text style={styles.ghostBtnText}>Done for today</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
    paddingVertical: 48,
  },
  topSection: {
    gap: 12,
  },
  eyebrow: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  title: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 48,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 24,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  statNumber: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -2,
  },
  statMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    fontWeight: '500',
  },
  divider: {
    width: 1,
    height: 64,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  buttons: {
    gap: 12,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  primaryBtnText: {
    color: '#0a0a0a',
    fontSize: 17,
    fontWeight: '600',
  },
  ghostBtn: {
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 17,
    fontWeight: '500',
  },
});
