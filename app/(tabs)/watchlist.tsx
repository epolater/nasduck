import { useRouter } from 'expo-router';
import { useRef } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { useWatchlistStore } from '../../store/watchlistStore';
import { WatchlistStock } from '../../store/watchlistStore';

export default function WatchlistScreen() {
  const router = useRouter();
  const { stocks, remove } = useWatchlistStore();

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
    <FlatList
      style={styles.container}
      data={stocks}
      keyExtractor={(item) => item.symbol}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => (
        <SwipeableRow onDelete={() => remove(item.symbol)}>
          <TouchableOpacity
            style={styles.row}
            activeOpacity={0.7}
            onPress={() => router.push(`/stock/${item.symbol}`)}
          >
            <View style={styles.rowLeft}>
              <Text style={styles.symbol}>{item.symbol}</Text>
              <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.addedAt}>
                Added {new Date(item.addedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </Text>
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
  );
}

const DELETE_WIDTH = 80;
const ROW_HEIGHT = 76;
const SWIPE_THRESHOLD = DELETE_WIDTH * 0.5;

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
      height: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, ROW_HEIGHT] }),
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
    height: ROW_HEIGHT,
  },
  rowLeft: { flex: 1 },
  symbol: { color: COLORS.text, fontWeight: '800', fontSize: 16 },
  name: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  addedAt: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  rowRight: { alignItems: 'flex-end' },
  price: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  pct: { fontSize: 13, fontWeight: '600', marginTop: 2 },
});
