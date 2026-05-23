import { Tabs, useRouter } from 'expo-router';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
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
          tabBarIcon: ({ color }) => <SignalsIcon color={color} />,
          tabBarBadge: signalCount > 0 ? signalCount : undefined,
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/(tabs)/settings')}
              style={{ marginRight: 16 }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Svg width={20} height={20} viewBox="0 0 20 20" fill="none">
                <Circle cx="10" cy="4" r="1.5" fill={COLORS.textSecondary} />
                <Circle cx="10" cy="10" r="1.5" fill={COLORS.textSecondary} />
                <Circle cx="10" cy="16" r="1.5" fill={COLORS.textSecondary} />
              </Svg>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{
          title: 'Watchlist',
          tabBarLabel: 'Watchlist',
          tabBarIcon: ({ color }) => <WatchlistIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'My Portfolio',
          tabBarLabel: 'Portfolio',
          tabBarIcon: ({ color }) => <PortfolioIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="criteria"
        options={{
          title: 'Criteria',
          tabBarLabel: 'Criteria',
          tabBarIcon: ({ color }) => <CriteriaIcon color={color} />,
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

// Criteria — checklist
function CriteriaIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      {/* row 1 */}
      <Path d="M3 5.5 L5.5 8 L9 4" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="6" x2="20" y2="6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* row 2 */}
      <Path d="M3 11.5 L5.5 14 L9 10" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="12" x2="20" y2="12" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* row 3 */}
      <Path d="M3 17.5 L5.5 20 L9 16" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="12" y1="18" x2="20" y2="18" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

// Portfolio — bag
function PortfolioIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      {/* handle */}
      <Path d="M8 7 C8 4.5 14 4.5 14 7" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      {/* bag body */}
      <Path d="M4 8 h14 l-1.5 11 H5.5 Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

// Watchlist — bookmark
function WatchlistIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      <Path
        d="M4 3h14a1 1 0 0 1 1 1v15l-8-4-8 4V4a1 1 0 0 1 1-1z"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function TabIcon({ symbol, color }: { symbol: string; color: string }) {
  return <Text style={{ fontSize: 20, opacity: color === COLORS.primary ? 1 : 0.5 }}>{symbol}</Text>;
}

// Signals — bar chart with a small upward arrow
function SignalsIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 22 22" fill="none">
      {/* bars */}
      <Rect x="1" y="12" width="4" height="8" rx="1" stroke={color} strokeWidth="1.5" />
      <Rect x="7" y="7" width="4" height="13" rx="1" stroke={color} strokeWidth="1.5" />
      <Rect x="13" y="4" width="4" height="16" rx="1" stroke={color} strokeWidth="1.5" />
      {/* arrow */}
      <Polyline points="17,2 20,2 20,5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <Line x1="16" y1="6" x2="20" y2="2" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}
