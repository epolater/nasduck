import axios from 'axios';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { CLOUD_SERVER_URL } from '../constants';
import { useCriteriaStore } from '../store/criteriaStore';
import { useSettingsStore } from '../store/settingsStore';

export function getDeviceId(): string {
  const model = (Device.modelName ?? 'unknown').replace(/\s/g, '_');
  const os = Device.osVersion ?? '0';
  return `${model}_${os}`;
}

export async function registerWithServer(): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    const { apiKey, scanHour, scanMinute, scanWeekends, minChangePct, minScore, minMarketCap, criteriaWeights } = useSettingsStore.getState();

    // Convert local scan time to UTC so server schedules correctly regardless of timezone
    const localDate = new Date();
    localDate.setHours(scanHour, scanMinute, 0, 0);
    const utcScanHour = localDate.getUTCHours();
    const utcScanMinute = localDate.getUTCMinutes();
    const { criteria, matchMode } = useCriteriaStore.getState();
    const { universe } = (await import('../store/scanStore')).useScanStore.getState();

    const res = await axios.post(`${CLOUD_SERVER_URL}/register`, {
      deviceId: getDeviceId(),
      pushToken,
      apiKey,
      criteria: criteria.filter(c => c.enabled),
      matchMode,
      minChangePct,
      minScore,
      minMarketCap,
      scanWeekends,
      utcScanHour,
      utcScanMinute,
      criteriaWeights,
      scanHour,
      scanMinute,
      universe: universe.stocks.length > 0 ? universe.stocks.map(s => s.symbol) : undefined,
    }, { timeout: 30000 }); // longer timeout when sending universe

    return { ok: true, message: res.data.message };
  } catch (e: any) {
    const status = e?.response?.status;
    const serverMsg = e?.response?.data?.error ?? e?.response?.data?.message;
    return { ok: false, error: `HTTP ${status ?? '?'}: ${serverMsg ?? e?.message ?? 'Connection failed'}` };
  }
}

export async function triggerServerScan(fresh = false): Promise<{ ok: boolean; error?: string; resumeIndex?: number; total?: number }> {
  try {
    const res = await axios.post(`${CLOUD_SERVER_URL}/scan/${getDeviceId()}`, { fresh }, { timeout: 10000 });
    return { ok: true, resumeIndex: res.data.resumeIndex, total: res.data.total };
  } catch (e: any) {
    const status = e?.response?.status;
    return { ok: false, error: status ? `${status}: ${e?.response?.data?.error ?? e?.message}` : e?.message ?? 'Failed' };
  }
}

export async function stopServerScan(): Promise<{ ok: boolean; error?: string }> {
  try {
    await axios.post(`${CLOUD_SERVER_URL}/stop/${getDeviceId()}`, {}, { timeout: 10000 });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Failed' };
  }
}

export interface CloudScanStatus {
  scanning: boolean;
  phase?: 'idle' | 'starting' | 'loading_universe' | 'scanning';
  progress: number;
  total: number;
  evaluated: number;
  noData: number;
  filtered: number;
  signals: any[];        // partial signals while scanning
  lastScanAt: number | null;
  lastSignals: any[];    // completed signals from last scan
  resumeIndex: number | null;
  universeTotal: number;
}

export async function getCloudScanStatus(): Promise<{ data: CloudScanStatus | null; error?: string }> {
  try {
    const res = await axios.get(`${CLOUD_SERVER_URL}/status/${getDeviceId()}`, { timeout: 8000 });
    return { data: res.data };
  } catch (e: any) {
    const status = e?.response?.status;
    const msg = status
      ? `HTTP ${status}: ${e?.response?.data?.error ?? e?.message}`
      : e?.message ?? 'Unknown error';
    return { data: null, error: msg };
  }
}

// Wake up the server with retries — Render free tier cold start takes up to 30s
export async function wakeupServer(): Promise<boolean> {
  const deviceId = getDeviceId();
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      await axios.get(`${CLOUD_SERVER_URL}/status/${deviceId}`, { timeout: 35000 });
      return true;
    } catch {
      if (attempt < 5) await new Promise(r => setTimeout(r, 8000));
    }
  }
  return false;
}
