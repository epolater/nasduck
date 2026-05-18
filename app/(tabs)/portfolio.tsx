import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  PanResponder,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { fetchQuote, searchSymbol } from '../../services/finnhub';
import { usePortfolioStore } from '../../store/portfolioStore';
import { useSettingsStore } from '../../store/settingsStore';
import { PortfolioStock } from '../../types';

interface QuoteData {
  price: number;
  changePercent: number;
}

export default function PortfolioScreen() {
  const { stocks, add, remove } = usePortfolioStore();
  const { apiKey } = useSettingsStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ symbol: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [quotes, setQuotes] = useState<Record<string, QuoteData>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (stocks.length === 0 || !apiKey) return;
    loadQuotes();
  }, [stocks.map((s) => s.symbol).join(','), apiKey]);

  async function loadQuotes() {
    setLoadingQuotes(true);
    const entries = await Promise.all(
      stocks.map(async (s) => {
        try {
          const q = await fetchQuote(s.symbol);
          if (!q) return null;
          return [s.symbol, { price: q.price, changePercent: q.changePercent }] as const;
        } catch {
          return null;
        }
      })
    );
    const map: Record<string, QuoteData> = {};
    for (const e of entries) {
      if (e) map[e[0]] = e[1];
    }
    setQuotes(map);
    setLoadingQuotes(false);
  }

  function handleQueryChange(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!text.trim() || !apiKey) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const r = await searchSymbol(text.trim());
      setResults(r);
      setSearching(false);
    }, 400);
  }

  async function handleAdd(item: { symbol: string; name: string }) {
    const stock: PortfolioStock = { symbol: item.symbol, name: item.name, addedAt: Date.now() };
    await add(stock);
    setQuery('');
    setResults([]);
  }

  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.infoText}>
          Stocks in your portfolio are checked against sell criteria during the daily scan.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={handleQueryChange}
          placeholder={apiKey ? 'Search to add a stock…' : 'Set API key in Settings first'}
          placeholderTextColor={COLORS.textMuted}
          editable={!!apiKey}
        />
        {searching && <ActivityIndicator size="small" color={COLORS.primary} style={styles.spinner} />}
      </View>

      {results.length > 0 && (
        <View style={styles.dropdown}>
          {results.map((item) => (
            <TouchableOpacity
              key={item.symbol}
              style={styles.dropdownItem}
              onPress={() => handleAdd(item)}
            >
              <Text style={styles.dropdownSymbol}>{item.symbol}</Text>
              <Text style={styles.dropdownName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.addIcon}>+</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {stocks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>💼</Text>
          <Text style={styles.emptyTitle}>Portfolio is empty</Text>
          <Text style={styles.emptySubtitle}>Add stocks you own to receive sell signals.</Text>
        </View>
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item }) => (
            <SwipeableRow onDelete={() => remove(item.symbol)}>
              <View style={styles.stockRow}>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockSymbol}>{item.symbol}</Text>
                  <Text style={styles.stockName} numberOfLines={1}>{item.name}</Text>
                </View>
                <View style={styles.priceBlock}>
                  {loadingQuotes && !quotes[item.symbol] ? (
                    <ActivityIndicator size="small" color={COLORS.textMuted} />
                  ) : quotes[item.symbol] ? (
                    <>
                      <Text style={styles.price}>${quotes[item.symbol].price.toFixed(2)}</Text>
                      <Text style={[
                        styles.change,
                        { color: quotes[item.symbol].changePercent >= 0 ? COLORS.buy : COLORS.sell }
                      ]}>
                        {quotes[item.symbol].changePercent >= 0 ? '+' : ''}
                        {quotes[item.symbol].changePercent.toFixed(2)}%
                      </Text>
                    </>
                  ) : null}
                </View>
              </View>
            </SwipeableRow>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const DELETE_WIDTH = 80;
const SWIPE_THRESHOLD = DELETE_WIDTH * 0.5;

function SwipeableRow({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const rowHeight = useRef(new Animated.Value(1)).current; // scale for collapse animation

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && Math.abs(g.dy) < Math.abs(g.dx),
      onPanResponderGrant: () => {
        translateX.stopAnimation();
      },
      onPanResponderMove: (_, g) => {
        const x = Math.min(0, Math.max(-DELETE_WIDTH, g.dx));
        translateX.setValue(x);
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
    <Animated.View style={{ height: rowHeight.interpolate({ inputRange: [0, 1], outputRange: [0, 72] }), overflow: 'hidden', marginBottom: 8 }}>
      <View style={styles.swipeContainer}>
        {/* Delete button behind the row */}
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
  container: { flex: 1, backgroundColor: COLORS.background, paddingHorizontal: 16 },
  info: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    marginTop: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  infoText: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 18 },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  input: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14,
  },
  spinner: { position: 'absolute', right: 12 },
  dropdown: {
    backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, marginTop: 4, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dropdownSymbol: { color: COLORS.text, fontWeight: '700', fontSize: 14, width: 70 },
  dropdownName: { flex: 1, color: COLORS.textSecondary, fontSize: 13 },
  addIcon: { color: COLORS.primary, fontSize: 22, fontWeight: '700', paddingLeft: 8 },
  list: { paddingTop: 12, paddingBottom: 20 },
  swipeContainer: { flex: 1, flexDirection: 'row', alignItems: 'stretch' },
  deleteBtn: {
    position: 'absolute', right: 0, top: 0, bottom: 0,
    width: DELETE_WIDTH, backgroundColor: COLORS.sell,
    alignItems: 'center', justifyContent: 'center', borderRadius: 10,
  },
  deleteText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  stockRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, height: 72,
  },
  stockInfo: { flex: 1 },
  stockSymbol: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  stockName: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  priceBlock: { alignItems: 'flex-end', minWidth: 70 },
  price: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  change: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center' },
});
