import { useRouter } from 'expo-router';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { isExpoGo } from '../../services/notifications';
import { useSettingsStore } from '../../store/settingsStore';
import { useScanStore } from '../../store/scanStore';

type MenuRow = {
  key: string;
  title: string;
  subtitle: string;
  subtitleColor?: string;
};

export default function SettingsScreen() {
  const router = useRouter();
  const { scanHour, scanMinute, minChangePct, aiModel, serverRegistered } = useSettingsStore();
  const { universe } = useScanStore();

  const timeLabel = `${String(scanHour).padStart(2, '0')}:${String(scanMinute).padStart(2, '0')}`;

  const universeAge = universe.lastUpdated
    ? Math.floor((Date.now() - universe.lastUpdated) / 86400000)
    : null;

  const universeSubtitle =
    universe.stocks.length > 0
      ? `${universe.stocks.length} stocks · ${universeAge === 0 ? 'Updated today' : universeAge !== null ? `Updated ${universeAge}d ago` : ''}`
      : 'Not built yet';

  const rows: MenuRow[] = [
    {
      key: 'universe',
      title: 'Scan Universe',
      subtitle: universeSubtitle,
    },
    {
      key: 'scan',
      title: 'Scan Settings',
      subtitle: `Daily at ${timeLabel} · Min change ${minChangePct.toFixed(1)}%`,
    },
    {
      key: 'cloud',
      title: 'Cloud Scan',
      subtitle: serverRegistered ? 'Enabled' : 'Disabled',
      subtitleColor: serverRegistered ? COLORS.buy : COLORS.textMuted,
    },
    {
      key: 'ai',
      title: 'AI Analysis',
      subtitle: aiModel ?? 'Not configured',
    },
    {
      key: 'scoring',
      title: 'Scoring Weights',
      subtitle: 'Adjust per-criterion buy score weights',
    },
    {
      key: 'debug',
      title: 'Debug & About',
      subtitle: 'Test API · App info',
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {isExpoGo && (
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>⚠️ Running in Expo Go</Text>
          <Text style={styles.bannerText}>
            Background scans are limited. The app will auto-scan when you open it at the scheduled time.
            A daily reminder notification will be sent to prompt you.
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>CONFIGURATION</Text>

      {rows.map((row, index) => (
        <TouchableOpacity
          key={row.key}
          style={[
            styles.row,
            index === 0 && styles.rowFirst,
            index === rows.length - 1 && styles.rowLast,
          ]}
          onPress={() => router.push(`/settings/${row.key}` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.rowContent}>
            <Text style={styles.rowTitle}>{row.title}</Text>
            <Text style={[styles.rowSubtitle, row.subtitleColor ? { color: row.subtitleColor } : undefined]}>
              {row.subtitle}
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  banner: {
    backgroundColor: '#ffa50218', borderRadius: 10, padding: 14,
    marginBottom: 20, borderWidth: 1, borderColor: '#ffa50255',
  },
  bannerTitle: { color: '#ffa502', fontWeight: '700', fontSize: 13, marginBottom: 4 },
  bannerText: { color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12,
    marginBottom: 1,
  },
  rowFirst: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  rowLast: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginBottom: 0 },
  rowContent: { flex: 1 },
  rowTitle: { color: COLORS.text, fontWeight: '600', fontSize: 15 },
  rowSubtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  chevron: { color: COLORS.textMuted, fontSize: 20, marginLeft: 8 },
});
