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

// Distinct colors used in test mode instead of real photos.
// Stored in the fake asset's `uri` field so all existing rendering paths
// can reference it without a separate data structure.
const PLACEHOLDER_COLORS = [
  '#C0392B', '#2980B9', '#27AE60', '#8E44AD',
  '#E67E22', '#16A085', '#D35400', '#2C3E50',
  '#E74C3C', '#3498DB', '#1ABC9C', '#9B59B6',
];

type Decision = { asset: MediaLibrary.AssetInfo; action: 'keep' | 'delete' };

type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;

export default function SwipeScreen({ route, navigation }: Props) {
  const { dailyLimit } = route.params;
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [assets, setAssets] = useState<MediaLibrary.AssetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [snap, setSnap] = useState({ index: 0, kept: 0, deleted: 0 });
  // Long-press ⋯ to toggle. Replaces real photos with instant colored rectangles
  // so animation behaviour can be compared without image-loading latency.
  const [testMode, setTestMode] = useState(false);

  // Counters in refs so panResponder callbacks never see stale closures
  const keptRef = useRef(0);
  const deletedRef = useRef(0);
  const indexRef = useRef(0);
  const navRef = useRef(navigation);
  navRef.current = navigation;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const decisionsRef = useRef<Decision[]>([]);
  decisionsRef.current = decisions;
  const isAnimatingRef = useRef(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  // ── Two-card animation system ─────────────────────────────────────────────
  //
  // isDepartingAnim toggles between 0 (card at rest) and 1 (card in flight).
  // effectivePanX/Y = multiply(isDepartingAnim, pan.x/y), so when
  // isDepartingAnim=0 the transforms are mathematically zero no matter where
  // pan is sitting — pan never needs to reset while a card is visible.
  //
  // Flow:
  //   onPanResponderGrant  → pan.setValue(0,0) + isDepartingAnim.setValue(1)
  //   swipe animation end  → setSnap(newIndex) + pendingDepartReset=true
  //   useLayoutEffect      → isDepartingAnim.setValue(0)  [after React commits
  //                          the new card as "current", before native paints]
  //   next grant           → pan reset is safe again (isDepartingAnim is 0,
  //                          so the card isn't moving regardless of pan value)
  //
  const pan = useRef(new Animated.ValueXY()).current;
  const isDepartingAnim = useRef(new Animated.Value(0)).current;
  // Stable derived nodes — created once via useRef initialiser
  const effectivePanX = useRef(Animated.multiply(isDepartingAnim, pan.x)).current;
  const effectivePanY = useRef(Animated.multiply(isDepartingAnim, pan.y)).current;

  // Signal for useLayoutEffect; set in the animation callback
  const pendingDepartReset = useRef(false);

  // Instantly zeroed when a swipe is committed so the departing card is
  // invisible even if it ghosts back to position zero before the next card
  // is committed by React. Restored to 1 in useLayoutEffect after commit.
  const departingOpacity = useRef(new Animated.Value(1)).current;

  // All visual interpolations derive from effectivePanX so they zero out
  // automatically when isDepartingAnim=0
  const rotateZ = effectivePanX.interpolate({
    inputRange: [-W / 2, 0, W / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
    extrapolate: 'clamp',
  });
  const deleteOpacity = effectivePanX.interpolate({
    inputRange: [-W * 0.35, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const keepOpacity = effectivePanX.interpolate({
    inputRange: [0, W * 0.35],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nextScale = effectivePanX.interpolate({
    inputRange: [-W * 0.5, 0, W * 0.5],
    outputRange: [1.0, 0.93, 1.0],
    extrapolate: 'clamp',
  });
  const nextOpacity = effectivePanX.interpolate({
    inputRange: [-W * 0.35, 0, W * 0.35],
    outputRange: [1.0, 0.55, 1.0],
    extrapolate: 'clamp',
  });

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !isAnimatingRef.current && !isPausedRef.current,
      onMoveShouldSetPanResponder: () => !isAnimatingRef.current && !isPausedRef.current,
      onPanResponderGrant: () => {
        // Reset pan here — safe because isDepartingAnim is still 0 so the
        // card hasn't moved yet (effectivePan = 0 * anything = 0).
        pan.setValue({ x: 0, y: 0 });
        isDepartingAnim.setValue(1); // now effectivePan tracks pan
      },
      onPanResponderMove: (_, g) => {
        pan.setValue({ x: g.dx, y: g.dy * 0.15 });
      },
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
          const dir = g.dx > 0 ? 'keep' : 'delete';
          const toX = g.dx > 0 ? W * 1.5 : -W * 1.5;
          isAnimatingRef.current = true;
          // Hide the departing card instantly on commit so any ghost frame
          // (card snapping to position zero before the next card renders)
          // is invisible. Restored to 1 in useLayoutEffect after commit.
          departingOpacity.setValue(0);

          Animated.timing(pan, {
            toValue: { x: toX, y: g.dy * 0.15 },
            duration: 220,
            useNativeDriver: false,
          }).start(({ finished }) => {
            isAnimatingRef.current = false;

            const prevIdx = indexRef.current;
            if (dir === 'keep') keptRef.current++;
            else deletedRef.current++;
            indexRef.current++;

            // Record decision immediately (before any navigation)
            const newDecision: Decision = { asset: assetsRef.current[prevIdx], action: dir };
            const newDecisions = [...decisionsRef.current, newDecision];
            decisionsRef.current = newDecisions;
            setDecisions(newDecisions);

            // Check completion before the !finished guard so the last card
            // always navigates even if the animation was interrupted
            if (indexRef.current >= assetsRef.current.length) {
              isDepartingAnim.setValue(0);
              departingOpacity.setValue(1);
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

            if (!finished) {
              isDepartingAnim.setValue(0);
              departingOpacity.setValue(1);
              return;
            }

            // Update snap (new card becomes React's "current").
            // useLayoutEffect fires after commit and calls isDepartingAnim.setValue(0):
            // the new card is already in the tree, effectivePan zeros out instantly,
            // and the new card appears at position zero — pan never needs to reset.
            setSnap({
              index: indexRef.current,
              kept: keptRef.current,
              deleted: deletedRef.current,
            });
            pendingDepartReset.current = true;
          });
        } else {
          // Not enough: spring back. isDepartingAnim stays 1 during the spring
          // so the card remains animated. We zero it out after the spring lands.
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            friction: 7,
            tension: 80,
            useNativeDriver: false,
          }).start(({ finished }) => {
            if (finished) isDepartingAnim.setValue(0);
          });
        }
      },
    })
  ).current;

  useEffect(() => {
    if (permission?.status === 'undetermined') requestPermission();
  }, [permission?.status, requestPermission]);

  useEffect(() => {
    if (testMode) {
      // Build fake assets immediately — no I/O, no permission needed.
      // Color is stored in `uri` so the existing rendering paths can use it.
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
      const resolved = await Promise.all(found.map((a) => MediaLibrary.getAssetInfoAsync(a)));
      setAssets(resolved);
      setLoading(false);
    }
    loadPhotos();
  }, [testMode, permission?.status, dailyLimit]);

  // Fires synchronously after React commits the new card as "current" (snap.index
  // changed). isDepartingAnim.setValue(0) zeros effectivePan immediately — the new
  // card's transforms collapse to zero so it appears at position zero with no flash.
  // pan.x is still at W*1.5 but is masked until the next gesture resets it.
  useLayoutEffect(() => {
    if (pendingDepartReset.current) {
      pendingDepartReset.current = false;
      isDepartingAnim.setValue(0);
      departingOpacity.setValue(1);
    }
  }, [snap.index]);

  // Prefetch the next 3 photos whenever the index advances so they are decoded
  // and ready before they become the front card. Skip in test mode — fake assets
  // are in-memory colors with no I/O to prefetch.
  useEffect(() => {
    if (testMode || assets.length === 0) return;
    for (let i = snap.index + 1; i <= snap.index + 3; i++) {
      if (i >= assets.length) break;
      const uri = assets[i].localUri ?? assets[i].uri;
      if (uri) Image.prefetch(uri).catch(() => {});
    }
  }, [testMode, snap.index, assets.length]);

  // --- Handlers ---

  const handlePause = () => {
    if (!isAnimatingRef.current) setIsPaused(true);
  };
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
    setSnap(prev => ({ ...prev, kept: newKept, deleted: newDeleted }));
  };

  // Resets the session and reloads assets in the opposite mode.
  // Triggered by long-pressing ⋯.
  const handleToggleTestMode = () => {
    const next = !testMode;
    indexRef.current = 0;
    keptRef.current = 0;
    deletedRef.current = 0;
    decisionsRef.current = [];
    isAnimatingRef.current = false;
    isDepartingAnim.setValue(0);
    departingOpacity.setValue(1);
    pan.setValue({ x: 0, y: 0 });
    setDecisions([]);
    setSnap({ index: 0, kept: 0, deleted: 0 });
    setIsPaused(false);
    setAssets([]);
    setLoading(true);
    setTestMode(next);
  };

  // --- Permission / loading gates ---

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

  const { index, kept, deleted } = snap;
  const current = assets[index];
  const next = assets[index + 1];
  const progressPct = ((index + 1) / assets.length) * 100;
  const remaining = assets.length - index;

  if (!current) return null;

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
            <Text style={styles.progressLabel}>{index + 1} / {assets.length}</Text>
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

      {/* ── Cards ── */}
      <View style={styles.cardArea}>
        {/* Back card: next photo, always at position zero.
            Scale/opacity still animate while the current card departs
            because nextScale/nextOpacity derive from effectivePanX. */}
        {next && (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.card,
              { opacity: nextOpacity, transform: [{ scale: nextScale }] },
            ]}
          >
            {testMode
              ? <View style={[StyleSheet.absoluteFill, { backgroundColor: next.uri }]} />
              : <Image source={{ uri: next.localUri ?? next.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            }
          </Animated.View>
        )}

        {/* Front card: current photo.
            departingOpacity is zeroed on swipe commit so any ghost frame
            (card returning to position zero before React commits the next
            card) is invisible. Restored to 1 in useLayoutEffect. */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.card,
            {
              opacity: departingOpacity,
              transform: [
                { translateX: effectivePanX },
                { translateY: effectivePanY },
                { rotate: rotateZ },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {testMode
            ? <View style={[StyleSheet.absoluteFill, { backgroundColor: current.uri }]} />
            : <Image source={{ uri: current.localUri ?? current.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          }
          <Animated.View style={[StyleSheet.absoluteFill, styles.deleteOverlay, { opacity: deleteOpacity }]}>
            <Ionicons name="trash" size={68} color="rgba(255,75,75,0.95)" />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.keepOverlay, { opacity: keepOpacity }]}>
            <Ionicons name="checkmark-circle" size={68} color="rgba(50,210,105,0.95)" />
          </Animated.View>
        </Animated.View>
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
  testBadge: {
    color: '#FFD60A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
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
  pauseCard: {
    width: '100%',
    backgroundColor: '#1c1c1e',
    borderRadius: 24,
    padding: 28,
    gap: 20,
  },
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
