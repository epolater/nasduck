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
    set((s) => ({ signals: [...s.signals, signal] }));
  },

  persist: async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify(get().signals));
  },

  setSignals: async (signals) => {
    set({ signals });
    await AsyncStorage.setItem(KEY, JSON.stringify(signals));
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
