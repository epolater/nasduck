import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { ScanState, ScanUniverse, ScanUniverseStock } from '../types';

export interface UniverseBuildState {
  status: 'idle' | 'running' | 'error';
  progress: number;
  total: number;
  error: string | null;
}

interface ScanStoreState {
  universe: ScanUniverse;
  scan: ScanState;
  universeBuild: UniverseBuildState;
  skipList: Set<string>;
  resumeIndex: number | null;
  setScanStatus: (status: ScanState['status'], progress?: number, total?: number, error?: string) => void;
  incrementScanCounters: (delta: { evaluated?: number; noData?: number; filtered?: number }) => void;
  setUniverseBuildStatus: (status: UniverseBuildState['status'], progress?: number, total?: number, error?: string) => void;
  setUniverse: (stocks: ScanUniverseStock[]) => Promise<void>;
  addToSkipList: (symbols: string[]) => Promise<void>;
  saveResumeIndex: (index: number) => Promise<void>;
  clearResumeIndex: () => Promise<void>;
  markScanComplete: () => void;
  loadUniverse: () => Promise<void>;
}

const UNIVERSE_KEY = 'nasduck:universe';
const SCAN_KEY = 'nasduck:scan_meta';
const SKIP_KEY = 'nasduck:skip_list';
const RESUME_KEY = 'nasduck:resume_index';

const BLANK_SCAN: ScanState = {
  status: 'idle', progress: 0, total: 0,
  lastScanAt: null, error: null,
  evaluated: 0, noData: 0, filtered: 0,
};

export const useScanStore = create<ScanStoreState>((set, get) => ({
  universe: { stocks: [], lastUpdated: 0 },
  skipList: new Set(),
  resumeIndex: null,
  scan: { ...BLANK_SCAN },
  universeBuild: { status: 'idle', progress: 0, total: 0, error: null },

  setScanStatus: (status, progress = 0, total = 0, error = undefined) => {
    set((s) => ({ scan: { ...s.scan, status, progress, total, error: error ?? null } }));
  },

  incrementScanCounters: (delta) => {
    set((s) => ({
      scan: {
        ...s.scan,
        evaluated: s.scan.evaluated + (delta.evaluated ?? 0),
        noData:    s.scan.noData    + (delta.noData    ?? 0),
        filtered:  s.scan.filtered  + (delta.filtered  ?? 0),
      },
    }));
  },

  setUniverseBuildStatus: (status, progress = 0, total = 0, error = undefined) => {
    set((s) => ({ universeBuild: { ...s.universeBuild, status, progress, total, error: error ?? null } }));
  },

  setUniverse: async (stocks) => {
    const universe: ScanUniverse = { stocks, lastUpdated: Date.now() };
    set({ universe });
    await AsyncStorage.setItem(UNIVERSE_KEY, JSON.stringify(universe));
  },

  addToSkipList: async (symbols) => {
    const updated = new Set([...get().skipList, ...symbols]);
    set({ skipList: updated });
    await AsyncStorage.setItem(SKIP_KEY, JSON.stringify([...updated]));
  },

  saveResumeIndex: async (index) => {
    set({ resumeIndex: index });
    await AsyncStorage.setItem(RESUME_KEY, String(index));
  },

  clearResumeIndex: async () => {
    set({ resumeIndex: null });
    await AsyncStorage.removeItem(RESUME_KEY);
  },

  markScanComplete: () => {
    const now = Date.now();
    set((s) => ({ scan: { ...s.scan, status: 'done', lastScanAt: now }, resumeIndex: null }));
    AsyncStorage.setItem(SCAN_KEY, JSON.stringify({ lastScanAt: now }));
    AsyncStorage.removeItem(RESUME_KEY);
  },

  loadUniverse: async () => {
    try {
      const [rawUniverse, rawMeta, rawSkip, rawResume] = await Promise.all([
        AsyncStorage.getItem(UNIVERSE_KEY),
        AsyncStorage.getItem(SCAN_KEY),
        AsyncStorage.getItem(SKIP_KEY),
        AsyncStorage.getItem(RESUME_KEY),
      ]);
      if (rawUniverse) set({ universe: JSON.parse(rawUniverse) });
      if (rawMeta) {
        const meta = JSON.parse(rawMeta);
        set((s) => ({ scan: { ...s.scan, lastScanAt: meta.lastScanAt ?? null } }));
      }
      if (rawSkip) set({ skipList: new Set(JSON.parse(rawSkip)) });
      if (rawResume) set({ resumeIndex: parseInt(rawResume, 10) });
    } catch (_) {}
  },
}));
