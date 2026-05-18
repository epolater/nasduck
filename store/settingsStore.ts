import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { DEFAULT_MIN_CHANGE_PCT } from '../constants';
import { setApiKey } from '../services/finnhub';
import { AiModelId } from '../services/ai';

interface Settings {
  apiKey: string;
  scanHour: number;        // 0-23
  scanMinute: number;      // 0-59
  minChangePct: number;    // minimum absolute % move to include a stock in results
  minScore: number;        // minimum score to show in buy signals list
  aiModel: AiModelId;
  googleAiKey: string;
  groqKey: string;
}

interface SettingsState extends Settings {
  save: (partial: Partial<Settings>) => Promise<void>;
  load: () => Promise<void>;
}

const KEY = 'nasduck:settings_v2';
const DEFAULTS: Settings = {
  apiKey: '',
  scanHour: 18,
  scanMinute: 0,
  minChangePct: DEFAULT_MIN_CHANGE_PCT,
  minScore: 1,
  aiModel: 'gemini-2.0-flash' as AiModelId,
  googleAiKey: '',
  groqKey: '',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULTS,

  save: async (partial) => {
    const updated = { ...get(), ...partial };
    if (partial.apiKey !== undefined) setApiKey(partial.apiKey);
    set(updated);
    await AsyncStorage.setItem(KEY, JSON.stringify({
      apiKey: updated.apiKey,
      scanHour: updated.scanHour,
      scanMinute: updated.scanMinute,
      minChangePct: updated.minChangePct,
      minScore: updated.minScore,
      aiModel: updated.aiModel,
      googleAiKey: updated.googleAiKey,
      groqKey: updated.groqKey,
    }));
  },

  load: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return;
      const saved: Partial<Settings> = JSON.parse(raw);
      if (saved.apiKey) setApiKey(saved.apiKey);
      set({ ...DEFAULTS, ...saved });
    } catch (_) {}
  },
}));
