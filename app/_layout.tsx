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

// Show all push notifications from server immediately
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


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
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start pinging server every 10 min while scan is running to prevent Render from sleeping
  function startKeepAlive() {
    if (keepAliveRef.current) return; // already running
    console.log('[KeepAlive] Starting keep-alive pings');
    keepAliveRef.current = setInterval(async () => {
      const { data } = await getCloudScanStatus().catch(() => ({ data: null }));
      console.log(`[KeepAlive] Ping — scanning: ${data?.scanning ?? 'unknown'}`);
      if (!data?.scanning) {
        stopKeepAlive(); // scan finished, stop pinging
      }
    }, 10 * 60 * 1000); // every 10 minutes
  }

  function stopKeepAlive() {
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
      console.log('[KeepAlive] Stopped keep-alive pings');
    }
  }

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
        await Notifications.cancelAllScheduledNotificationsAsync(); // clear any old wakeup notifications
        registerWithServer().catch(() => {});
        scheduleScanTimer(scanHour, scanMinute);
        // If a scan is already running (e.g. app reopened mid-scan), start keep-alive immediately
        getCloudScanStatus().then(({ data }) => {
          if (data?.scanning) startKeepAlive();
        }).catch(() => {});
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    }
    init();

    // Start keep-alive when server push notification arrives saying scan started
    const notifListener = Notifications.addNotificationReceivedListener((notification) => {
      const title = notification.request.content.title ?? '';
      if (title.includes('Scan started') || title.includes('scan started')) {
        startKeepAlive();
      }
    });

    return () => {
      if (scanTimerRef.current) clearTimeout(scanTimerRef.current);
      stopKeepAlive();
      notifListener.remove();
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
        await registerWithServer();  // re-register in case server cold-started with empty store
        await triggerServerScan(true);
        startKeepAlive(); // keep server alive during scan
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
