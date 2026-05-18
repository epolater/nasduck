import { Tabs, useRouter } from 'expo-router';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../constants';
import { useSignalsStore } from '../../store/signalsStore';

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
  const router = useRouter();
  const { buySignals, sellSignals } = useSignalsStore();
  const signalCount = buySignals().length + sellSignals().length;

  return (
    <Tabs
      screenOptions={{
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.border,
          borderTopWidth: 1,
          height: 60 + bottom,
          paddingBottom: 8 + bottom,
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: COLORS.background },
        headerTitleStyle: { color: COLORS.text, fontWeight: '800', fontSize: 20 },
        headerTintColor: COLORS.text,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarLabel: 'Signals',
          headerTitle: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Image
                source={require('../../assets/icon.png')}
                style={{ width: 30, height: 30, borderRadius: 7 }}
              />
              <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 20 }}>Nasduck</Text>
            </View>
          ),
          tabBarIcon: ({ color }) => <TabIcon symbol="📊" color={color} />,
          tabBarBadge: signalCount > 0 ? signalCount : undefined,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/settings')}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={{ fontSize: 18, color: COLORS.textSecondary }}>⚙</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarLabel: 'Watchlist',
          tabBarIcon: ({ color }) => <TabIcon symbol="⭐" color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'My Portfolio',
          tabBarLabel: 'Portfolio',
          tabBarIcon: ({ color }) => <TabIcon symbol="💼" color={color} />,
        }}
      />
      <Tabs.Screen
        name="criteria"
        options={{
          title: 'Criteria',
          tabBarLabel: 'Criteria',
          tabBarIcon: ({ color }) => <TabIcon symbol="🎯" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon symbol="⚙️" color={color} />,
          href: null, // hide from tab bar
        }}
      />
    </Tabs>
  );
}

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  const { Text } = require('react-native');
  return <Text style={{ fontSize: 20, opacity: color === COLORS.primary ? 1 : 0.5 }}>{symbol}</Text>;
}
