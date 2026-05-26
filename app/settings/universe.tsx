import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { COLORS } from '../../constants';
import { useScanStore } from '../../store/scanStore';
import { useSettingsStore } from '../../store/settingsStore';
import { buildUniverse } from '../../tasks/dailyScanner';

const TIERS: { label: string; value: number; desc: string }[] = [
  { label: 'All',     value: 0,   desc: 'No filter' },
  { label: 'Small+',  value: 0.3, desc: '>$300M' },
  { label: 'Mid+',    value: 2,   desc: '>$2B' },
  { label: 'Large+',  value: 10,  desc: '>$10B' },
  { label: 'Mega',    value: 200, desc: '>$200B' },
];

export default function UniverseScreen() {
  const { universe, universeBuild, skipList } = useScanStore();
  const { universeTier, serverRegistered, save } = useSettingsStore();
  const isBuilding = universeBuild.status === 'running';

  // Cloud scan can't handle very large universes — force Mid+ minimum
  const CLOUD_MIN_TIER = 2;
  const cloudLocksTier = serverRegistered;

  const universeAge = universe.lastUpdated
    ? Math.floor((Date.now() - universe.lastUpdated) / 86400000)
    : null;

  async function handleTierSelect(value: number) {
    if (cloudLocksTier && value < CLOUD_MIN_TIER) return;
    await save({ universeTier: value });
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Scan Universe' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.sectionLabel}>UNIVERSE TIER</Text>
        <Text style={styles.sectionDesc}>
          Coarse market cap filter used when building the universe. Precise filtering is applied per-stock during the scan.
        </Text>
        {cloudLocksTier && (
          <Text style={[styles.sectionDesc, { color: COLORS.primary }]}>
            Cloud scan is enabled — minimum tier is Mid+ to keep server scans fast.
          </Text>
        )}

        <View style={styles.tierRow}>
          {TIERS.map((t) => {
            const active = universeTier === t.value;
            const disabled = cloudLocksTier && t.value < CLOUD_MIN_TIER;
            return (
              <TouchableOpacity
                key={t.value}
                style={[styles.tierBtn, active && styles.tierBtnActive, disabled && { opacity: 0.35 }]}
                onPress={() => handleTierSelect(t.value)}
                disabled={disabled}
              >
                <Text style={[styles.tierLabel, active && styles.tierLabelActive]}>{t.label}</Text>
                <Text style={[styles.tierDesc, active && styles.tierDescActive]}>{t.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>SCAN UNIVERSE</Text>
        <Text style={styles.sectionDesc}>
          The list of NASDAQ stocks checked in buy scans. Refresh weekly to include new listings.
        </Text>

        <View style={styles.universeInfo}>
          <View>
            {isBuilding ? (
              <View style={styles.buildingTop}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.buildingText}>Fetching symbols…</Text>
              </View>
            ) : (
              <Text style={styles.universeCount}>
                {universe.stocks.length > 0 ? `${universe.stocks.length} stocks` : 'Not built yet'}
              </Text>
            )}
            {universeAge !== null && !isBuilding && (
              <Text style={styles.universeAge}>
                {universeAge === 0 ? 'Updated today' : `Updated ${universeAge}d ago`}
                {skipList.size > 0 ? `  ·  ${skipList.size} skipped` : ''}
              </Text>
            )}
            {universeBuild.status === 'error' && (
              <Text style={styles.universeError}>{universeBuild.error}</Text>
            )}
          </View>
          <TouchableOpacity
            style={[styles.buildBtn, isBuilding && { opacity: 0.4 }]}
            onPress={() => buildUniverse()}
            disabled={isBuilding}
          >
            <Text style={styles.buildBtnText}>
              {universe.stocks.length > 0 ? 'Rebuild' : 'Build Universe'}
            </Text>
          </TouchableOpacity>
        </View>

        {skipList.size > 0 && (
          <Text style={styles.sectionDesc}>
            {skipList.size} stocks in skip list (low volume / penny stocks filtered automatically).
          </Text>
        )}

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 6,
  },
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 12, lineHeight: 18 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  tierRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  tierBtn: {
    flex: 1, minWidth: 56,
    backgroundColor: COLORS.surface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    paddingVertical: 10, alignItems: 'center',
  },
  tierBtnActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tierLabel: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  tierLabelActive: { color: '#000' },
  tierDesc: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  tierDescActive: { color: '#000' },
  universeInfo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  universeCount: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  universeAge: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  universeError: { color: COLORS.sell, fontSize: 12, marginTop: 4 },
  buildingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buildingText: { flex: 1, color: COLORS.text, fontSize: 13 },
  buildBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  buildBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
});
