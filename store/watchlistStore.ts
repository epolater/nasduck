import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export interface WatchlistStock {
  symbol: string;
  name: string;
  addedAt: number;
  price: number;
  changePercent: number;
}

interface WatchlistState {
  stocks: WatchlistStock[];
  add: (stock: WatchlistStock) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
  has: (symbol: string) => boolean;
  load: () => Promise<void>;
}

const KEY = 'nasduck:watchlist';

export const useWatchlistStore = create<WatchlistState>((set, get) => ({
  stocks: [],

  add: async (stock) => {
    if (get().has(stock.symbol)) return;
    const updated = [...get().stocks, stock];
    set({ stocks: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  remove: async (symbol) => {
    const updated = get().stocks.filter((s) => s.symbol !== symbol);
    set({ stocks: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  has: (symbol) => get().stocks.some((s) => s.symbol === symbol),

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ stocks: JSON.parse(raw) });
    } catch (_) {}
  },
}));
