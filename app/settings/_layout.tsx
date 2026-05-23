import { Stack } from 'expo-router';
import { COLORS } from '../../constants';

export default function SettingsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.surface },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontWeight: '700', color: COLORS.text },
        headerBackTitle: 'Settings',
      }}
    />
  );
}
