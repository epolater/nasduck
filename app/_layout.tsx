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
import { scheduleDailyNotification } from '../tasks/dailyScanner';

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

      const { scanHour: h, scanMinute: m } = useSettingsStore.getState();
      await scheduleDailyNotification(h, m);
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
      </Stack>
    </>
  );
}
