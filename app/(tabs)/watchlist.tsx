import { useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { Stack } from 'expo-router';
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { useWatchlistStore } from '../../store/watchlistStore';
import { DraggableList } from '../../components/DraggableList';

const ROW_HEIGHT = 86; // row height + margin

export default function WatchlistScreen() {
  const router = useRouter();
  const { stocks, remove, reorder } = useWatchlistStore();
  const scrollRef = useRef<ScrollView>(null);
  const [editMode, setEditMode] = useState(false);

  if (stocks.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>⭐</Text>
        <Text style={styles.emptyTitle}>Watchlist is empty</Text>
        <Text style={styles.emptySubtitle}>
          Open any stock detail and tap the ⭐ button to add it here.
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{
        headerRight: () => (
          <TouchableOpacity onPress={() => setEditMode(e => !e)} style={[styles.editBtn, editMode && styles.editBtnActive]}>
            <Text style={[styles.editBtnText, editMode && styles.editBtnTextActive]}>
              {editMode ? 'Done' : 'Reorder'}
            </Text>
          </TouchableOpacity>
        ),
      }} />
    <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={styles.content}>
      <DraggableList
        data={stocks}
        keyExtractor={(item) => item.symbol}
        itemHeight={ROW_HEIGHT}
        editMode={editMode}
        scrollRef={scrollRef}
        onReorder={(from, to) => reorder(from, to)}
        renderItem={(item) => (
          <SwipeableRow onDelete={() => remove(item.symbol)}>
            <TouchableOpacity
              style={styles.row}
              activeOpacity={1}
              onPress={() => router.push(`/stock/${item.symbol}`)}
            >
              <View style={styles.rowLeft}>
                <View style={styles.symbolRow}>
                  <Text style={styles.symbol}>{item.symbol}</Text>
                  <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                <Text style={[styles.pct, { color: item.changePercent >= 0 ? COLORS.positive : COLORS.negative }]}>
                  {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                </Text>
              </View>
            </TouchableOpacity>
          </SwipeableRow>
        )}
      />
    </ScrollView>
    </>
  );
}

const DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = DELETE_WIDTH * 0.5;
const ROW_H = 76;

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < Math.abs(g.dx),
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, g) => {
        translateX.setValue(Math.min(0, Math.max(-DELETE_WIDTH, g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -SWIPE_THRESHOLD) {
          Animated.spring(translateX, { toValue: -DELETE_WIDTH, useNativeDriver: true }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  function handleDelete() {
    Animated.parallel([
      Animated.timing(translateX, { toValue: -300, duration: 200, useNativeDriver: true }),
      Animated.timing(rowHeight, { toValue: 0, duration: 250, useNativeDriver: false }),
    ]).start(() => onDelete());
  }

  return (
    <Animated.View style={{
      height: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, ROW_H] }),
      overflow: 'hidden', marginBottom: 10,
    }}>
      <View style={styles.swipeContainer}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
        <Animated.View style={{ transform: [{ translateX }], flex: 1 }} {...panResponder.panHandlers}>
          {children}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  empty: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  editBtn: {
    marginRight: 16, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1, borderColor: COLORS.border,
  },
  editBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  editBtnText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  editBtnTextActive: { color: '#000' },

  swipeContainer: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  deleteBtn: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: DELETE_WIDTH, backgroundColor: COLORS.sell,
    alignItems: 'center', justifyContent: 'center', borderRadius: 12,
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: COLORS.border,
    height: ROW_H,
  },
  rowLeft: { flex: 1, justifyContent: 'center' },
  symbolRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  symbol: { color: COLORS.text, fontWeight: '800', fontSize: 16, flexShrink: 0 },
  name: { color: COLORS.textSecondary, fontSize: 12, flexShrink: 1 },
  rowRight: { alignItems: 'flex-end' },
  price: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  pct: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
