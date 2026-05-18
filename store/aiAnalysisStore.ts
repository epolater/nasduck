import { create } from 'zustand';
import { AiAnalysisResult } from '../services/ai';

interface AiAnalysisEntry {
  result: AiAnalysisResult;
  analyzedAt: number;
  modelId: string;
}

interface AiAnalysisState {
  cache: Record<string, AiAnalysisEntry>;
  set: (symbol: string, result: AiAnalysisResult, modelId: string) => void;
  get: (symbol: string) => AiAnalysisEntry | null;
  clear: (symbol: string) => void;
}

export const useAiAnalysisStore = create<AiAnalysisState>((set, get) => ({
  cache: {},

  set: (symbol, result, modelId) =>
    set((s) => ({
      cache: { ...s.cache, [symbol]: { result, analyzedAt: Date.now(), modelId } },
    })),

  get: (symbol) => get().cache[symbol] ?? null,

  clear: (symbol) =>
    set((s) => {
      const next = { ...s.cache };
      delete next[symbol];
      return { cache: next };
    }),
}));
