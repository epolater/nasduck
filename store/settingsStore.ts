import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { CRITERIA_WEIGHTS, DEFAULT_MIN_CHANGE_PCT } from '../constants';
import { AiModelId } from '../services/ai';

interface Settings {
  scanHour: number;        // 0-23
  scanMinute: number;      // 0-59
  scanWeekends: boolean;   // include weekends
  minChangePct: number;    // minimum absolute % move to include a stock in results
  minScore: number;        // minimum score to show in buy signals list
  minMarketCap: number;    // minimum market cap in billions for scan filtering (0 = disabled)
  universeTier: number;    // market cap tier for universe build: 0=all, 0.3=small+, 2=mid+, 10=large+, 200=mega
  aiModel: AiModelId;
  googleAiKey: string;
  groqKey: string;
  serverRegistered: boolean;
  criteriaWeights: Record<string, number>;
}

interface SettingsState extends Settings {
  save: (partial: Partial<Settings>) => Promise<void>;
  load: () => Promise<void>;
}

const KEY = 'nasduck:settings_v2';
const DEFAULTS: Settings = {
  scanHour: 18,
  scanMinute: 0,
  scanWeekends: false,
  minChangePct: DEFAULT_MIN_CHANGE_PCT,
  minScore: 1,
  minMarketCap: 1,
  universeTier: 10,        // default: large+ (>$10B)
  aiModel: 'gemini-2.0-flash' as AiModelId,
  googleAiKey: '',
  groqKey: '',
  serverRegistered: false,
  criteriaWeights: { ...CRITERIA_WEIGHTS },
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  save: async (partial) => {
    const updated = { ...get(), ...partial };
    set(updated);
    await AsyncStorage.setItem(KEY, JSON.stringify({
      scanHour: updated.scanHour,
      scanMinute: updated.scanMinute,
      minChangePct: updated.minChangePct,
      minScore: updated.minScore,
      minMarketCap: updated.minMarketCap,
      universeTier: updated.universeTier,
      aiModel: updated.aiModel,
      googleAiKey: updated.googleAiKey,
      groqKey: updated.groqKey,
      serverRegistered: updated.serverRegistered,
      scanWeekends: updated.scanWeekends,
      criteriaWeights: updated.criteriaWeights,
    }));
  },

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      const saved: Partial<Settings> = JSON.parse(raw);
      set({ ...DEFAULTS, ...saved });
    } catch (_) {}
  },
}));
