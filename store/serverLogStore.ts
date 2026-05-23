import { create } from 'zustand';

export interface LogEntry {
  time: string;
  msg: string;
  type: 'info' | 'ok' | 'err';
}

interface ServerLogState {
  logs: LogEntry[];
  addLog: (msg: string, type?: 'info' | 'ok' | 'err') => void;
  clear: () => void;
}

export const useServerLogStore = create<ServerLogState>((set) => ({
  logs: [],

  addLog: (msg, type = 'info') => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    set((s) => ({ logs: [...s.logs.slice(-99), { time, msg, type }] }));
  },

  clear: () => set({ logs: [] }),
}));
