import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { COLORS } from '../constants';
import { requestNotificationPermissions } from '../services/notifications';
import { useCriteriaStore } from '../store/criteriaStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useWatchlistStore } from '../store/watchlistStore';
import { useScanStore } from '../store/scanStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSignalsStore } from '../store/signalsStore';
import * as Notifications from 'expo-notifications';
import { registerWithServer, getCloudScanStatus } from '../services/serverSync';

// Handle incoming notifications — used to wake up server when silent ping fires
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isServerWakeup = notification.request.content.data?.type === 'server_wakeup';
    if (isServerWakeup) {
      // Ping server to wake it up — checkMissedScan will fire on the server side
      getCloudScanStatus().catch(() => {});
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
      title: '',
      body: '',
      data: { type: 'server_wakeup' },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: scanHour,
      minute: scanMinute,
    },
  });
}

export default function RootLayout() {
  useEffect(() => {
    async function init() {
      const { load: loadSettings, scanHour, scanMinute } = useSettingsStore.getState();
      await loadSettings();

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
        // Schedule a silent daily notification at scan time to wake the server
        await scheduleServerWakeup(scanHour, scanMinute);
        // Re-register to restore config after server restart
        registerWithServer().catch(() => {});
      } else {
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    }
    init();
  }, []);

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
