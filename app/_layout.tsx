import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { EventEmitter } from 'eventemitter3';
import { COLORS } from '../constants';

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

// Keep-alive interval — module-level so setNotificationHandler can access it
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

function startKeepAlive() {
  if (keepAliveInterval) return;
  console.log('[KeepAlive] Starting keep-alive pings');
  keepAliveInterval = setInterval(async () => {
    const { data } = await getCloudScanStatus().catch(() => ({ data: null }));
    console.log(`[KeepAlive] Ping — scanning: ${data?.scanning ?? 'unknown'}`);
    if (!data?.scanning) stopKeepAlive();
  }, 10 * 60 * 1000); // every 10 minutes
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[KeepAlive] Stopped keep-alive pings');
  }
}

// Handles all push notifications — runs in background too
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const title = notification.request.content.title ?? '';
    const isServerWakeup = notification.request.content.data?.type === 'server_wakeup';

    // Start keep-alive when scan started notification arrives (works in background)
    if (title.includes('Scan started')) {
      startKeepAlive();
    }

    // Background wakeup: phone wakes server and triggers scan
    if (isServerWakeup) {
      const { serverRegistered } = useSettingsStore.getState();
      if (serverRegistered) {
        wakeupServer().then(async (ok) => {
          if (!ok) return;
          await registerWithServer();
          await triggerServerScan(true);
          startKeepAlive();
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
        // If scan already running when app opens, start keep-alive immediately
        getCloudScanStatus().then(({ data }) => {
          if (data?.scanning) startKeepAlive();
        }).catch(() => {});
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    }
    init();

    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      stopKeepAlive();
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
        startKeepAlive();
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
