import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../App';

const { width: W } = Dimensions.get('window');
const SWIPE_THRESHOLD = W * 0.28;
const REVIEW_ITEM_SIZE = Math.floor((W - 112 - 8) / 3);

const PLACEHOLDER_COLORS = [
  '#C0392B', '#2980B9', '#27AE60', '#8E44AD',
  '#E67E22', '#16A085', '#D35400', '#2C3E50',
  '#E74C3C', '#3498DB', '#1ABC9C', '#9B59B6',
];

type Decision = { asset: MediaLibrary.AssetInfo; action: 'keep' | 'delete' };
type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;

type BottomCardProps = { asset: MediaLibrary.AssetInfo; testMode: boolean };

function BottomCard({ asset, testMode }: BottomCardProps) {
  // Hold a display asset that lags one rAF behind prop changes.
  // When topIndex increments, the new SwipeCard mounts (showing assets[N+1]
  // from cache) while we still display assets[N+1] here — identical content,
  // no gap. The rAF then quietly updates us to assets[N+2] while we're hidden
  // behind the SwipeCard.
  const [displayAsset, setDisplayAsset] = useState(asset);

  useEffect(() => {
    const t0 = performance.now();
    console.log(`[SWIPE] BottomCard useEffect — asset.id changed to ${asset.id} at ${t0.toFixed(2)}`);
    const raf = requestAnimationFrame((rafT) => {
      console.log(`[SWIPE] BottomCard rAF fired — displayAsset updating at ${rafT.toFixed(2)} (+${(rafT - t0).toFixed(2)}ms since effect)`);
      setDisplayAsset(asset);
    });
    return () => cancelAnimationFrame(raf);
  }, [asset.id]);

  return (
    <View style={[StyleSheet.absoluteFill, styles.card]}>
      {testMode
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: displayAsset.uri }]} />
        : <Image source={{ uri: displayAsset.localUri ?? displayAsset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      }
    </View>
  );
}

// ─── SwipeCard ────────────────────────────────────────────────────────────────
//
// Owns its own pan and PanResponder. The parent mounts a fresh instance for
// every card by setting key={topIndex}. When a swipe is committed:
//   1. The fly-out animation completes (card is off-screen at ±W*1.5)
//   2. onSwipeComplete fires → parent increments topIndex
//   3. React UNMOUNTS this component at its off-screen position
//   4. A new SwipeCard mounts with a fresh pan at {x:0, y:0}
//
// The departing card is never repositioned to zero — it ceases to exist at
// its off-screen location, making ghost frames structurally impossible.
//
// ─────────────────────────────────────────────────────────────────────────────

type SwipeCardProps = {
  asset: MediaLibrary.AssetInfo;
  testMode: boolean;
  isPausedRef: React.MutableRefObject<boolean>;
  onSwipeComplete: (dir: 'keep' | 'delete') => void;
};

function SwipeCard({ asset, testMode, isPausedRef, onSwipeComplete }: SwipeCardProps) {
  const pan = useRef(new Animated.ValueXY()).current;
  const departingOpacity = useRef(new Animated.Value(1)).current;
  const isAnimatingRef = useRef(false);
  const mountTimeRef = useRef(performance.now());

  // Ref so the PanResponder closure never captures a stale callback.
  const onCompleteRef = useRef(onSwipeComplete);
  onCompleteRef.current = onSwipeComplete;

  useLayoutEffect(() => {
    console.log(`[SWIPE] SwipeCard MOUNT useLayoutEffect  asset=${asset.id} at ${performance.now().toFixed(2)}`);
    return () => {
      console.log(`[SWIPE] SwipeCard UNMOUNT useLayoutEffect cleanup asset=${asset.id} at ${performance.now().toFixed(2)}`);
    };
  }, []);

  useEffect(() => {
    console.log(`[SWIPE] SwipeCard MOUNT useEffect  asset=${asset.id} at ${performance.now().toFixed(2)} (+${(performance.now() - mountTimeRef.current).toFixed(2)}ms since layoutEffect)`);
    return () => {
      console.log(`[SWIPE] SwipeCard UNMOUNT useEffect cleanup  asset=${asset.id} at ${performance.now().toFixed(2)}`);
    };
  }, []);

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

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isAnimatingRef.current && !isPausedRef.current,
      onMoveShouldSetPanResponder: () => !isAnimatingRef.current && !isPausedRef.current,
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.15 });
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
          const dir: 'keep' | 'delete' = g.dx > 0 ? 'keep' : 'delete';
          const toX = g.dx > 0 ? W * 1.5 : -W * 1.5;
          isAnimatingRef.current = true;
          const t0 = performance.now();
          console.log(`[SWIPE] onSwipeCommit — opacity zeroed, fly-out starting at ${t0.toFixed(2)}`);
          departingOpacity.setValue(0);

          Animated.timing(pan, {
            toValue: { x: toX, y: g.dy * 0.15 },
            duration: 220,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (finished) {
              const t1 = performance.now();
              console.log(`[SWIPE] fly-out animation complete at ${t1.toFixed(2)} (+${(t1 - t0).toFixed(2)}ms since commit)`);
              // Card is now off-screen. Signal the parent; it will increment
              // topIndex which unmounts this component at its current position.
              // pan is intentionally NOT reset — there is no position zero to
              // flash back to before unmount.
              onCompleteRef.current(dir);
            } else {
              isAnimatingRef.current = false;
            }
          });
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 7,
            tension: 80,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (finished) isAnimatingRef.current = false;
          });
        }
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        styles.card,
        {
          opacity: departingOpacity,
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
            { rotate: rotateZ },
          ],
        },
      ]}
      {...panResponder.panHandlers}
    >
      {testMode
        ? <View style={[StyleSheet.absoluteFill, { backgroundColor: asset.uri }]} />
        : <Image
            source={{ uri: asset.localUri ?? asset.uri }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => console.log(`[SWIPE] SwipeCard Image onLoad  asset=${asset.id} at ${performance.now().toFixed(2)}`)}
          />
      }
      <Animated.View style={[StyleSheet.absoluteFill, styles.deleteOverlay, { opacity: deleteOpacity }]}>
        <Ionicons name="trash" size={68} color="rgba(255,75,75,0.95)" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, styles.keepOverlay, { opacity: keepOpacity }]}>
        <Ionicons name="checkmark-circle" size={68} color="rgba(50,210,105,0.95)" />
      </Animated.View>
    </Animated.View>
  );
}

// ─── SwipeScreen ──────────────────────────────────────────────────────────────

export default function SwipeScreen({ route, navigation }: Props) {
  const { dailyLimit } = route.params;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [session, setSession] = useState({ topIndex: 0, kept: 0, deleted: 0 });
  const [testMode, setTestMode] = useState(false);

  // Refs for values read inside callbacks — avoids stale-closure bugs.
  const keptRef = useRef(0);
  const deletedRef = useRef(0);
  const indexRef = useRef(0);
  const navRef = useRef(navigation);
  navRef.current = navigation;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const decisionsRef = useRef<Decision[]>([]);
  decisionsRef.current = decisions;
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (permission?.status === 'undetermined') requestPermission();
  }, [permission?.status, requestPermission]);

  useEffect(() => {
    if (testMode) {
      const fake = Array.from({ length: dailyLimit }, (_, i) => ({
        id: `test-${i}`,
        uri: PLACEHOLDER_COLORS[i % PLACEHOLDER_COLORS.length],
      } as unknown as MediaLibrary.AssetInfo));
      setAssets(fake);
      setLoading(false);
      return;
    }
    if (permission?.status !== 'granted') return;
    async function loadPhotos() {
      const { assets: found } = await MediaLibrary.getAssetsAsync({
        first: dailyLimit,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });
      const resolved = await Promise.all(found.map(a => MediaLibrary.getAssetInfoAsync(a)));
      setAssets(resolved);
      setLoading(false);
    }
    loadPhotos();
  }, [testMode, permission?.status, dailyLimit]);

  // Pre-decode is handled by the persistent render layer in JSX below.
  // Image.prefetch only fetches compressed bytes; rendering at card resolution
  // ensures the bitmap is fully decoded before a card becomes the top card.

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSwipeComplete = (dir: 'keep' | 'delete') => {
    const t2 = performance.now();
    console.log(`[SWIPE] handleSwipeComplete called at ${t2.toFixed(2)}`);
    const prevIdx = indexRef.current;
    if (dir === 'keep') keptRef.current++;
    else deletedRef.current++;
    indexRef.current++;

    const newDecision: Decision = { asset: assetsRef.current[prevIdx], action: dir };
    const newDecisions = [...decisionsRef.current, newDecision];
    decisionsRef.current = newDecisions;

    if (indexRef.current >= assetsRef.current.length) {
      const deletedAssets = newDecisions
        .filter(d => d.action === 'delete')
        .map(d => ({ id: d.asset.id, uri: d.asset.uri, localUri: d.asset.localUri }));
      navRef.current.replace('Summary', {
        kept: keptRef.current,
        deleted: deletedRef.current,
        deletedAssets,
      });
      return;
    }

    setDecisions(newDecisions);
    const t3 = performance.now();
    console.log(`[SWIPE] setSession called (React re-render enqueued) at ${t3.toFixed(2)} (+${(t3 - t2).toFixed(2)}ms since handler entry)`);
    setSession({ topIndex: indexRef.current, kept: keptRef.current, deleted: deletedRef.current });
  };

  const handlePause = () => setIsPaused(true);
  const handleContinue = () => setIsPaused(false);

  const handleEndSession = () => {
    const deletedAssets = decisionsRef.current
      .filter(d => d.action === 'delete')
      .map(d => ({ id: d.asset.id, uri: d.asset.uri, localUri: d.asset.localUri }));
    navigation.replace('Summary', {
      kept: keptRef.current,
      deleted: deletedRef.current,
      deletedAssets,
    });
  };

  const handleUndo = (idx: number) => {
    const updated = decisions.map((d, i) =>
      i !== idx ? d : { ...d, action: (d.action === 'keep' ? 'delete' : 'keep') as 'keep' | 'delete' }
    );
    decisionsRef.current = updated;
    const newKept = updated.filter(d => d.action === 'keep').length;
    const newDeleted = updated.filter(d => d.action === 'delete').length;
    keptRef.current = newKept;
    deletedRef.current = newDeleted;
    setDecisions(updated);
    setSession(prev => ({ ...prev, kept: newKept, deleted: newDeleted }));
  };

  const handleToggleTestMode = () => {
    const next = !testMode;
    indexRef.current = 0;
    keptRef.current = 0;
    deletedRef.current = 0;
    decisionsRef.current = [];
    setDecisions([]);
    setSession({ topIndex: 0, kept: 0, deleted: 0 });
    setIsPaused(false);
    setAssets([]);
    setLoading(true);
    setTestMode(next);
  };

  // ── Loading / permission gates ─────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
      </View>
    );
  }

  if (!testMode) {
    if (permission === null || permission.status === 'undetermined') {
      return (
        <View style={[styles.root, styles.centered]}>
          <ActivityIndicator color="rgba(255,255,255,0.5)" size="large" />
        </View>
      );
    }
    if (permission.status === 'denied') {
      return (
        <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
          <Ionicons name="images-outline" size={52} color="rgba(255,255,255,0.25)" />
          <Text style={styles.gateTitle}>No photo access</Text>
          <Text style={styles.gateBody}>
            Enable photo library access for Swoosh in Settings to get started.
          </Text>
        </View>
      );
    }
  }

  if (assets.length === 0) {
    return (
      <View style={[styles.root, styles.centered]}>
        <Ionicons name="images-outline" size={52} color="rgba(255,255,255,0.25)" />
        <Text style={styles.gateTitle}>No photos found</Text>
        <Text style={styles.gateBody}>Your camera roll appears to be empty.</Text>
      </View>
    );
  }

  const { topIndex, kept, deleted } = session;
  const currentAsset = assets[topIndex];
  const nextAsset = assets[topIndex + 1];
  const progressPct = ((topIndex + 1) / assets.length) * 100;
  const remaining = assets.length - topIndex;

  if (!currentAsset) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.statsRow}>
          <View style={styles.chip}>
            <Ionicons name="trash-outline" size={13} color="rgba(255,255,255,0.4)" />
            <Text style={styles.chipText}>{deleted}</Text>
          </View>
          <View style={styles.progressCenter}>
            {testMode && <Text style={styles.testBadge}>TEST</Text>}
            <Text style={styles.progressLabel}>{topIndex + 1} / {assets.length}</Text>
          </View>
          <View style={styles.rightGroup}>
            <View style={styles.chip}>
              <Text style={styles.chipText}>{kept}</Text>
              <Ionicons name="checkmark" size={13} color="rgba(255,255,255,0.4)" />
            </View>
            <Pressable
              onPress={handlePause}
              onLongPress={handleToggleTestMode}
              hitSlop={12}
              style={styles.menuBtn}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="rgba(255,255,255,0.3)" />
            </Pressable>
          </View>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${progressPct}%` as any }]} />
        </View>
      </View>

      {/* ── Card stack ── */}
      <View style={styles.cardArea}>
        {/* Pre-decode cache — renders upcoming images at card resolution with
            stable asset.id keys so the same Image component persists across
            topIndex changes. opacity 0.001 forces native layer decode without
            being visible. Sits behind BottomCard and SwipeCard in z-order. */}
        {!testMode && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {[topIndex + 1, topIndex + 2, topIndex + 3].map(i => {
              if (i >= assets.length) return null;
              const a = assets[i];
              return (
                <Image
                  key={a.id}
                  source={{ uri: a.localUri ?? a.uri }}
                  style={[StyleSheet.absoluteFill, { opacity: 0.001 }]}
                  resizeMode="cover"
                />
              );
            })}
          </View>
        )}

        {/* Bottom card — stable key so it never unmounts on swap. Its displayed
            image lags one rAF so the transition frame shows identical content
            to the incoming SwipeCard, which loads the same URI from cache. */}
        {nextAsset && (
          <BottomCard key="bottom-card" asset={nextAsset} testMode={testMode} />
        )}

        {/* Top card — fresh instance per photo (key = topIndex).
            Goes to opacity 0 on commit, flies off screen, then unmounts. */}
        <SwipeCard
          key={topIndex}
          asset={currentAsset}
          testMode={testMode}
          isPausedRef={isPausedRef}
          onSwipeComplete={handleSwipeComplete}
        />
      </View>

      {/* ── Pause overlay ── */}
      {isPaused && (
        <View style={styles.overlay}>
          <View style={[styles.pauseCard, decisions.length > 0 && { maxHeight: '88%' }]}>
            <Text style={styles.pauseTitle}>Session Paused</Text>

            <View style={styles.pauseStats}>
              <View style={styles.pauseStatRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color="rgba(255,255,255,0.5)" />
                <Text style={styles.pauseStatText}>{kept} kept</Text>
              </View>
              <View style={styles.pauseStatRow}>
                <Ionicons name="trash-outline" size={18} color="rgba(255,255,255,0.5)" />
                <Text style={styles.pauseStatText}>{deleted} marked for deletion</Text>
              </View>
              <View style={styles.pauseStatRow}>
                <Ionicons name="images-outline" size={18} color="rgba(255,255,255,0.5)" />
                <Text style={styles.pauseStatText}>{remaining} remaining</Text>
              </View>
            </View>

            {decisions.length > 0 && (
              <View style={styles.reviewSection}>
                <Text style={styles.reviewLabel}>Previously Reviewed</Text>
                <ScrollView
                  style={styles.reviewScroll}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                >
                  <View style={styles.reviewGrid}>
                    {decisions.map((d, idx) => (
                      <Pressable
                        key={d.asset.id}
                        onPress={() => handleUndo(idx)}
                        style={[
                          styles.reviewItem,
                          d.action === 'keep' ? styles.reviewItemKept : styles.reviewItemDeleted,
                        ]}
                      >
                        {testMode
                          ? <View style={[StyleSheet.absoluteFill, { backgroundColor: d.asset.uri }]} />
                          : <Image source={{ uri: d.asset.localUri ?? d.asset.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        }
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            )}

            <Pressable
              onPress={handleContinue}
              style={({ pressed }) => [styles.continueBtn, pressed && styles.continueBtnPressed]}
            >
              <Text style={styles.continueBtnText}>Keep Going</Text>
            </Pressable>
            <Pressable
              onPress={handleEndSession}
              style={({ pressed }) => [styles.endBtn, pressed && styles.endBtnPressed]}
            >
              <Text style={styles.endBtnText}>End Session</Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
  gateTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 20, fontWeight: '600', textAlign: 'center' },
  gateBody: { color: 'rgba(255,255,255,0.35)', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 44 },
  rightGroup: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuBtn: { padding: 2 },
  chipText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600' },
  progressCenter: { alignItems: 'center', gap: 2 },
  progressLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  testBadge: { color: '#FFD60A', fontSize: 9, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  track: { height: 2, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 1 },
  fill: { height: 2, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 1 },
  cardArea: { flex: 1, margin: 20, marginTop: 12, marginBottom: 40 },
  card: { borderRadius: 24, overflow: 'hidden', backgroundColor: '#1a1a1a' },
  deleteOverlay: { backgroundColor: 'rgba(180,25,25,0.22)', alignItems: 'center', justifyContent: 'center' },
  keepOverlay: { backgroundColor: 'rgba(25,160,65,0.22)', alignItems: 'center', justifyContent: 'center' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  pauseCard: { width: '100%', backgroundColor: '#1c1c1e', borderRadius: 24, padding: 28, gap: 20 },
  pauseTitle: { color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  pauseStats: { gap: 12 },
  pauseStatRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pauseStatText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: '500' },
  reviewSection: { gap: 12 },
  reviewLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  reviewScroll: { maxHeight: 196 },
  reviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  reviewItem: {
    width: REVIEW_ITEM_SIZE,
    height: REVIEW_ITEM_SIZE,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  reviewItemKept: { borderColor: 'rgba(50,210,105,0.85)' },
  reviewItemDeleted: { borderColor: 'rgba(255,75,75,0.85)' },
  continueBtn: { height: 52, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  continueBtnPressed: { backgroundColor: 'rgba(255,255,255,0.88)' },
  continueBtnText: { color: '#0a0a0a', fontSize: 16, fontWeight: '600' },
  endBtn: { height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  endBtnPressed: { backgroundColor: 'rgba(255,255,255,0.13)' },
  endBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, fontWeight: '600' },
});
