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

// Handle background notifications — wakes server when silent ping fires
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isServerWakeup = notification.request.content.data?.type === 'server_wakeup';
    if (isServerWakeup) {
      const { serverRegistered } = useSettingsStore.getState();
      if (serverRegistered) {
        // Wake server with retries, then trigger scan directly
        wakeupServer().then((ok) => {
          if (!ok) return;
          triggerServerScan(true).then(() => {
            setTimeout(() => {
              getCloudScanStatus().then(({ data }) => {
                if (data?.scanning) serverWakeupEmitter.emit('scanStarted');
              }).catch(() => {});
            }, 3000);
          }).catch(() => {});
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
      title: 'Nasduck',          // non-empty so Android doesn't drop it
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
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    }
    init();

    return () => { if (scanTimerRef.current) clearTimeout(scanTimerRef.current); };
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
