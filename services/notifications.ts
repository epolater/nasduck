import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SignalType } from '../types';

// Local notifications still work in Expo Go SDK 54 — only remote push tokens are unsupported.
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

if (!isExpoGo) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} else {
  // In Expo Go, set a minimal handler that avoids triggering remote notification setup
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch (_) {}
}

export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    if (Platform.OS === 'android' && !isExpoGo) {
      await Notifications.setNotificationChannelAsync('nasduck-alerts', {
        name: 'Stock Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00d4aa',
        sound: 'default',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    if (existingStatus === 'granted') return true;

    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

export async function sendStockAlert(
  symbol: string,
  signal: SignalType,
  message: string,
  price: number,
) {
  try {
    const emoji = signal === 'buy' ? '🟢' : signal === 'sell' ? '🔴' : '🟡';
    const action = signal === 'buy' ? 'BUY' : signal === 'sell' ? 'SELL' : 'WATCH';

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${emoji} ${action} Signal: ${symbol}`,
        body: `$${price.toFixed(2)} — ${message}`,
        data: { symbol, signal },
        sound: 'default',
        ...(isExpoGo ? {} : { badge: 1, categoryIdentifier: 'stock-alert' }),
      },
      trigger: null,
    });
  } catch (_) {}
}

export { isExpoGo };
