import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

const { width: W } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.28;

const PLACEHOLDER_COLORS = [
  '#1a1a2e', '#16213e', '#0f3460', '#533483',
  '#2d6a4f', '#1b4332', '#40916c', '#6d4c41',
  '#4e342e', '#37474f', '#263238', '#4527a0',
  '#311b92', '#6a1b9a', '#bf360c', '#1565c0',
  '#0d47a1', '#c62828', '#558b2f', '#33691e',
  '#f57f17', '#006064', '#004d40', '#880e4f',
  '#4a148c', '#1a237e', '#004838', '#3e2723',
  '#212121', '#1c1c2e', '#2e1a47', '#0d2137',
];

function makePhotos(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    color: PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length],
  }));
}

type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;

export default function SwipeScreen({ route, navigation }: Props) {
  const { dailyLimit } = route.params;
  const insets = useSafeAreaInsets();
  const photos = useMemo(() => makePhotos(dailyLimit), [dailyLimit]);

  // All mutable counters live in refs so panResponder callbacks are never stale
  const keptRef = useRef(0);
  const deletedRef = useRef(0);
  const indexRef = useRef(0);
  const navRef = useRef(navigation);
  navRef.current = navigation;
  const photosRef = useRef(photos);
  photosRef.current = photos;

  const [snap, setSnap] = useState({ index: 0, kept: 0, deleted: 0 });

  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.15 });
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
          const dir = g.dx > 0 ? 'keep' : 'delete';
          const toX = g.dx > 0 ? W * 1.5 : -W * 1.5;

          Animated.timing(pan, {
            toValue: { x: toX, y: g.dy * 0.15 },
            duration: 220,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (!finished) return;

            if (dir === 'keep') keptRef.current++;
            else deletedRef.current++;
            indexRef.current++;

            if (indexRef.current >= photosRef.current.length) {
              navRef.current.replace('Summary', {
                kept: keptRef.current,
                deleted: deletedRef.current,
              });
              return;
            }

            pan.setValue({ x: 0, y: 0 });
            setSnap({
              index: indexRef.current,
              kept: keptRef.current,
              deleted: deletedRef.current,
            });
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 7,
            tension: 80,
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  const rotateZ = pan.x.interpolate({
    inputRange: [-W / 2, 0, W / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });

  const deleteOpacity = pan.x.interpolate({
    inputRange: [-W * 0.35, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const keepOpacity = pan.x.interpolate({
    inputRange: [0, W * 0.35],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const nextScale = pan.x.interpolate({
    inputRange: [-W * 0.5, 0, W * 0.5],
    outputRange: [1.0, 0.93, 1.0],
    extrapolate: 'clamp',
  });

  const nextOpacity = pan.x.interpolate({
    inputRange: [-W * 0.35, 0, W * 0.35],
    outputRange: [1.0, 0.55, 1.0],
    extrapolate: 'clamp',
  });

  const { index, kept, deleted } = snap;
  const current = photos[index];
  const next = photos[index + 1];
  const progressPct = ((index + 1) / photos.length) * 100;

  if (!current) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <View style={styles.chip}>
            <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.4)" />
            <Text style={styles.chipText}>{deleted}</Text>
          </View>
          <Text style={styles.progressLabel}>
            {index + 1} / {photos.length}
          </Text>
          <View style={styles.chip}>
            <Text style={styles.chipText}>{kept}</Text>
            <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.4)" />
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progressPct}%` as any }]} />
        </View>
      </View>

      <View style={styles.cardArea}>
        {next && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.card,
              {
                backgroundColor: next.color,
                opacity: nextOpacity,
                transform: [{ scale: nextScale }],
              },
            ]}
          />
        )}

        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.card,
            {
              backgroundColor: current.color,
              transform: [
                { translateX: pan.x },
                { translateY: pan.y },
                { rotate: rotateZ },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.deleteOverlay, { opacity: deleteOpacity }]}
          >
            <Ionicons name="trash" size={68} color="rgba(255, 75, 75, 0.95)" />
          </Animated.View>
          <Animated.View
            style={[StyleSheet.absoluteFill, styles.keepOverlay, { opacity: keepOpacity }]}
          >
            <Ionicons name="checkmark-circle" size={68} color="rgba(50, 210, 105, 0.95)" />
          </Animated.View>
        </Animated.View>
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minWidth: 44,
  },
  chipText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: '600',
  },
  progressLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    fontWeight: '600',
  },
  track: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
  },
  fill: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 1,
  },
  cardArea: {
    flex: 1,
    margin: 20,
    marginTop: 12,
    marginBottom: 40,
  },
  card: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  deleteOverlay: {
    backgroundColor: 'rgba(180, 25, 25, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keepOverlay: {
    backgroundColor: 'rgba(25, 160, 65, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
