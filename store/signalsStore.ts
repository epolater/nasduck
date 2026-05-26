import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { Signal } from '../types';

interface SignalsState {
  signals: Signal[];
  addSignal: (signal: Signal) => void;       // real-time update, no persist
  persist: () => Promise<void>;              // flush current state to storage
  setSignals: (signals: Signal[]) => Promise<void>;
  clear: () => Promise<void>;
  load: () => Promise<void>;
  buySignals: () => Signal[];
  sellSignals: () => Signal[];
}

const KEY = 'nasduck:signals';

export const useSignalsStore = create<SignalsState>((set, get) => ({
  signals: [],

  addSignal: (signal) => {
    set((s) => {
      // Dedup by symbol — within a scan, only one signal per symbol.
      // Prevents duplicate React keys if id collides or scan re-adds a symbol.
      const filtered = s.signals.filter((x) => x.symbol !== signal.symbol);
      return { signals: [...filtered, signal] };
    });
  },

  persist: async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(get().signals));
  },

  setSignals: async (signals) => {
    // Dedup by symbol — last write wins per symbol
    const bySymbol = new Map<string, Signal>();
    signals.forEach((s) => bySymbol.set(s.symbol, s));
    const deduped = Array.from(bySymbol.values());
    set({ signals: deduped });
    await AsyncStorage.setItem(KEY, JSON.stringify(deduped));
  },

  clear: async () => {
    set({ signals: [] });
    await AsyncStorage.removeItem(KEY);
  },

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ signals: JSON.parse(raw) });
    } catch (_) {}
  },

  buySignals: () => get().signals.filter((s) => s.signal === 'buy'),
  sellSignals: () => get().signals.filter((s) => s.signal === 'sell'),
}));
