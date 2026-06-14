import { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AssetParam, RootStackParamList } from '../App';

const GRID_GAP = 2;
const ITEM_SIZE = Math.floor((Dimensions.get('window').width - GRID_GAP * 2) / 3);

type Props = NativeStackScreenProps<RootStackParamList, 'DeletionReview'>;

function GridItem({ asset, onUndo }: { asset: AssetParam; onUndo: (id: string) => void }) {
  return (
    <View style={styles.gridItem}>
      <Image
        source={{ uri: asset.localUri ?? asset.uri }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <Pressable
        onPress={() => onUndo(asset.id)}
        style={styles.undoBtn}
        hitSlop={6}
      >
        <View style={styles.undoBtnInner}>
          <Ionicons name="close" size={11} color="#ffffff" />
        </View>
      </Pressable>
    </View>
  );
}

export default function DeletionReviewScreen({ route, navigation }: Props) {
  const [assets, setAssets] = useState(route.params.assets);
  const insets = useSafeAreaInsets();

  const handleUndo = (id: string) => {
    setAssets(prev => prev.filter(a => a.id !== id));
  };

  const handleConfirm = async () => {
    if (assets.length > 0) {
      try {
        await MediaLibrary.deleteAssetsAsync(assets.map(a => a.id));
      } catch {
        // On iOS in Expo Go deletion requires a development build.
        // Fail silently and return to summary either way.
      }
    }
    navigation.goBack();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="rgba(255,255,255,0.7)" />
        </Pressable>
        <Text style={styles.headerTitle}>Review Deletions</Text>
        <View style={styles.backBtn} />
      </View>

      <Text style={styles.subtitle}>
        {assets.length === 0
          ? 'Nothing left to delete.'
          : `${assets.length} photo${assets.length !== 1 ? 's' : ''} will be deleted. Tap any to keep it.`}
      </Text>

      <FlatList
        data={assets}
        keyExtractor={item => item.id}
        numColumns={3}
        columnWrapperStyle={styles.row}
        ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
        renderItem={({ item }) => <GridItem asset={item} onUndo={handleUndo} />}
        contentContainerStyle={styles.gridContent}
        style={styles.list}
      />

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 16 }]}>
        <Pressable
          onPress={handleConfirm}
          style={({ pressed }) => [
            styles.confirmBtn,
            assets.length === 0 && styles.confirmBtnEmpty,
            pressed && styles.confirmBtnPressed,
          ]}
        >
          <Text style={[styles.confirmBtnText, assets.length === 0 && styles.confirmBtnTextEmpty]}>
            {assets.length === 0 ? 'Done' : `Delete ${assets.length} Photo${assets.length !== 1 ? 's' : ''}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { color: '#ffffff', fontSize: 17, fontWeight: '600' },
  subtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 28,
    paddingTop: 6,
    paddingBottom: 16,
  },
  list: { flex: 1 },
  gridContent: { paddingBottom: 8 },
  row: { gap: GRID_GAP },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  undoBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  undoBtnInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: '#0a0a0a',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  confirmBtn: {
    height: 56,
    borderRadius: 14,
    backgroundColor: 'rgba(255,75,75,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnEmpty: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  confirmBtnPressed: {
    backgroundColor: 'rgba(255,75,75,0.65)',
  },
  confirmBtnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  confirmBtnTextEmpty: {
    color: 'rgba(255,255,255,0.4)',
  },
});
