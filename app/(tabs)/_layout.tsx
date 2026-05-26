import { Tabs } from 'expo-router';
import { Image, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg';
import { COLORS } from '../../constants';
import { useSignalsStore } from '../../store/signalsStore';

export default function TabLayout() {
  const { bottom } = useSafeAreaInsets();
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
          tabBarIcon: ({ color }) => <SettingsIcon color={color} />,
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

// Settings — gear
function SettingsIcon({ color }: { color: string }) {
  // Feather "settings" icon — centered at 12,12 in a 24×24 grid
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.5" />
      <Path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
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
