import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_CRITERIA } from '../constants';
import { CriteriaId, ScreenerCriteria } from '../types';

export type MatchMode = 'any' | 'all';

interface CriteriaState {
  criteria: ScreenerCriteria[];
  matchMode: MatchMode;
  toggleCriteria: (id: CriteriaId) => Promise<void>;
  setAllEnabled: (enabled: boolean, signal?: 'buy' | 'sell') => Promise<void>;
  setThreshold: (id: CriteriaId, value: number) => Promise<void>;
  setThreshold2: (id: CriteriaId, value: number) => Promise<void>;
  setMatchMode: (mode: MatchMode) => Promise<void>;
  reorderCriteria: (fromId: CriteriaId, toId: CriteriaId) => Promise<void>;
  enabledBuyCriteria: () => ScreenerCriteria[];
  enabledSellCriteria: () => ScreenerCriteria[];
  load: () => Promise<void>;
}

const KEY = 'nasduck:criteria_v2';
const MODE_KEY = 'nasduck:match_mode';

export const useCriteriaStore = create<CriteriaState>((set, get) => ({
  criteria: DEFAULT_CRITERIA,
  matchMode: 'any',

  toggleCriteria: async (id) => {
    const updated = get().criteria.map((c) =>
      c.id === id ? { ...c, enabled: !c.enabled } : c,
    );
    set({ criteria: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  setAllEnabled: async (enabled, signal) => {
    const updated = get().criteria.map((c) =>
      (signal == null || c.signal === signal) ? { ...c, enabled } : c,
    );
    set({ criteria: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  setThreshold: async (id, value) => {
    const updated = get().criteria.map((c) =>
      c.id === id ? { ...c, threshold: value } : c,
    );
    set({ criteria: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  setThreshold2: async (id, value) => {
    const updated = get().criteria.map((c) =>
      c.id === id ? { ...c, threshold2: value } : c,
    );
    set({ criteria: updated });
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  },

  reorderCriteria: async (fromId, toId) => {
    const list = [...get().criteria];
    const fromIdx = list.findIndex((c) => c.id === fromId);
    const toIdx = list.findIndex((c) => c.id === toId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [item] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, item);
    set({ criteria: list });
    await AsyncStorage.setItem(KEY, JSON.stringify(list));
  },

  setMatchMode: async (mode) => {
    set({ matchMode: mode });
    await AsyncStorage.setItem(MODE_KEY, mode);
  },

  enabledBuyCriteria: () =>
    get().criteria.filter((c) => c.signal === 'buy' && c.enabled),

  enabledSellCriteria: () =>
    get().criteria.filter((c) => c.signal === 'sell' && c.enabled),

  load: async () => {
    try {
      const [raw, rawMode] = await Promise.all([
        AsyncStorage.getItem(KEY),
        AsyncStorage.getItem(MODE_KEY),
      ]);
      if (raw) {
        const saved: ScreenerCriteria[] = JSON.parse(raw);
        // Restore saved order: start from saved list, then append any new default criteria not yet in storage
        const merged = saved
          .map((s) => {
            const def = DEFAULT_CRITERIA.find((d) => d.id === s.id);
            if (!def) return null; // criteria removed from defaults — drop it
            return { ...def, enabled: s.enabled, threshold: s.threshold, ...(s.threshold2 != null ? { threshold2: s.threshold2 } : {}) };
          })
          .filter(Boolean) as ScreenerCriteria[];
        // Append any brand-new criteria added to defaults since last save
        DEFAULT_CRITERIA.forEach((def) => {
          if (!merged.find((c) => c.id === def.id)) merged.push(def);
        });
        set({ criteria: merged });
      }
      if (rawMode === 'any' || rawMode === 'all') {
        set({ matchMode: rawMode });
      }
    } catch (_) {}
  },
}));
