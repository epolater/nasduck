import { create } from 'zustand';
import { AiAnalysisResult, ChatMessage } from '../services/ai';

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

  // Chat history — in-memory only, resets on app restart
  chatHistory: Record<string, ChatMessage[]>;
  getChatHistory: (symbol: string) => ChatMessage[];
  setChatHistory: (symbol: string, messages: ChatMessage[]) => void;
  clearChatHistory: (symbol: string) => void;
}

export const useAiAnalysisStore = create<AiAnalysisState>((set, get) => ({
  cache: {},
  chatHistory: {},

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

  getChatHistory: (symbol) => get().chatHistory[symbol] ?? [],

  setChatHistory: (symbol, messages) =>
    set((s) => ({
      chatHistory: { ...s.chatHistory, [symbol]: messages },
    })),

  clearChatHistory: (symbol) =>
    set((s) => {
      const next = { ...s.chatHistory };
      delete next[symbol];
      return { chatHistory: next };
    }),
}));
