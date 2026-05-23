import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { PortfolioStock } from '../types';

interface PortfolioState {
  stocks: PortfolioStock[];
  add: (stock: PortfolioStock) => Promise<void>;
  remove: (symbol: string) => Promise<void>;
  reorder: (fromIndex: number, toIndex: number) => Promise<void>;
  has: (symbol: string) => boolean;
  load: () => Promise<void>;
}

const KEY = 'nasduck:portfolio';

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
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

  reorder: async (fromIndex, toIndex) => {
    const stocks = [...get().stocks];
    const [moved] = stocks.splice(fromIndex, 1);
    stocks.splice(toIndex, 0, moved);
    set({ stocks });
    await AsyncStorage.setItem(KEY, JSON.stringify(stocks));
  },

  has: (symbol) => get().stocks.some((s) => s.symbol === symbol),

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ stocks: JSON.parse(raw) });
    } catch (_) {}
  },
}));
