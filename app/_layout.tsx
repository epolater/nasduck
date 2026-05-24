import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { EventEmitter } from 'eventemitter3';
import { COLORS } from '../constants';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

export const serverWakeupEmitter = new EventEmitter();

import { requestNotificationPermissions } from '../services/notifications';
import { useCriteriaStore } from '../store/criteriaStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useScanStore } from '../store/scanStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSignalsStore } from '../store/signalsStore';
import * as Notifications from 'expo-notifications';
import { registerWithServer, getCloudScanStatus, wakeupServer, triggerServerScan } from '../services/serverSync';

// ── Background task — pings server every ~15 min to keep Render alive ──
const KEEP_ALIVE_TASK = 'nasduck-keep-alive';

TaskManager.defineTask(KEEP_ALIVE_TASK, async () => {
  try {
    const { serverRegistered } = useSettingsStore.getState();
    if (!serverRegistered) return BackgroundFetch.BackgroundFetchResult.NoData;
    const { data } = await getCloudScanStatus().catch(() => ({ data: null }));
    console.log(`[KeepAlive BG] Ping — scanning: ${data?.scanning ?? 'unknown'}`);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

async function registerKeepAliveTask() {
  const status = await BackgroundFetch.getStatusAsync();
  if (status === BackgroundFetch.BackgroundFetchStatus.Restricted ||
      status === BackgroundFetch.BackgroundFetchStatus.Denied) {
    console.log('[KeepAlive BG] Background fetch not available');
    return;
  }
  const isRegistered = await TaskManager.isTaskRegisteredAsync(KEEP_ALIVE_TASK);
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(KEEP_ALIVE_TASK, {
      minimumInterval: 10 * 60, // 10 minutes (OS may run less frequently)
      stopOnTerminate: false,
      startOnBoot: true,
    });
    console.log('[KeepAlive BG] Background task registered');
  }
}

async function unregisterKeepAliveTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(KEEP_ALIVE_TASK);
  if (isRegistered) {
    await BackgroundFetch.unregisterTaskAsync(KEEP_ALIVE_TASK);
    console.log('[KeepAlive BG] Background task unregistered');
  }
}

// Handles all push notifications — runs in background too
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isServerWakeup = notification.request.content.data?.type === 'server_wakeup';

    // Background wakeup: phone wakes server and triggers scan
    if (isServerWakeup) {
      const { serverRegistered } = useSettingsStore.getState();
      if (serverRegistered) {
        wakeupServer().then(async (ok) => {
          if (!ok) return;
          await registerWithServer();
          await triggerServerScan(true);
          setTimeout(() => {
            getCloudScanStatus().then(({ data }) => {
              if (data?.scanning) serverWakeupEmitter.emit('scanStarted');
            }).catch(() => {});
          }, 3000);
        });
      }
    }

    return {
      shouldShowAlert: !isServerWakeup,
      shouldPlaySound: !isServerWakeup,
      shouldSetBadge: false,
    };
  },
});

async function scheduleServerWakeup(scanHour: number, scanMinute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nasduck',
      body: 'Starting scan…',
      data: { type: 'server_wakeup' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: scanHour,
      minute: scanMinute,
    },
  });
}

// Returns ms until the next occurrence of hour:minute (today or tomorrow)
function msUntilTime(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date();
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

export default function RootLayout() {
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    async function init() {
      await useSettingsStore.getState().load();

      await Promise.all([
        useCriteriaStore.getState().load(),
        usePortfolioStore.getState().load(),
        useWatchlistStore.getState().load(),
        useSignalsStore.getState().load(),
        useScanStore.getState().loadUniverse(),
      ]);

      await requestNotificationPermissions();

      const { serverRegistered, scanHour, scanMinute } = useSettingsStore.getState();

      if (serverRegistered) {
        await scheduleServerWakeup(scanHour, scanMinute);
        registerWithServer().catch(() => {});
        scheduleScanTimer(scanHour, scanMinute);
        await registerKeepAliveTask();
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
        await unregisterKeepAliveTask();
      }
    }
    init();

    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    };
  }, []);

  function scheduleScanTimer(scanHour: number, scanMinute: number) {
    if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
    const ms = msUntilTime(scanHour, scanMinute);
    console.log(`[ScanTimer] Scan timer set — fires in ${Math.round(ms / 60000)} min`);
    scanTimerRef.current = setTimeout(async () => {
      const { serverRegistered } = useSettingsStore.getState();
      if (!serverRegistered) return;
      console.log('[ScanTimer] Scan time reached — waking server and triggering scan');
      const ok = await wakeupServer();
      if (ok) {
        await registerWithServer();
        await triggerServerScan(true);
        setTimeout(() => {
          getCloudScanStatus().then(({ data }) => {
            if (data?.scanning) serverWakeupEmitter.emit('scanStarted');
          }).catch(() => {});
        }, 3000);
      }
      // Re-arm for tomorrow
      scheduleScanTimer(scanHour, scanMinute);
    }, ms);
  }

  return (
    <>
      <StatusBar style="light" backgroundColor={COLORS.background} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontWeight: '700', color: COLORS.text },
          contentStyle: { backgroundColor: COLORS.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="stock/[symbol]" options={{ title: '' }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
