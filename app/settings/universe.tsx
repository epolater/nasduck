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
import { buildUniverse, abortUniverseBuild } from '../../tasks/dailyScanner';

export default function UniverseScreen() {
  const { apiKey } = useSettingsStore();
  const { universe, universeBuild, skipList } = useScanStore();
  const isBuilding = universeBuild.status === 'running';

  const universeAge = universe.lastUpdated
    ? Math.floor((Date.now() - universe.lastUpdated) / 86400000)
    : null;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Scan Universe' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            style={[styles.btn, styles.btnOutline, (!apiKey || isBuilding) && { opacity: 0.4 }]}
            onPress={() => buildUniverse()}
            disabled={!apiKey || isBuilding}
          >
            <Text style={styles.btnOutlineText}>
              {universe.stocks.length > 0 ? 'Refresh' : 'Build Universe'}
            </Text>
          </TouchableOpacity>
        </View>

        {skipList.size > 0 && (
          <Text style={styles.sectionDesc}>
            {skipList.size} stocks in skip list (low volume / penny stocks filtered automatically).
          </Text>
        )}

        <Text style={styles.note}>
          Fetches all NASDAQ common stocks (≤4 char symbols). Price/volume filtering happens automatically during the first scan via the skip list.
        </Text>
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
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  universeInfo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  universeCount: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  universeAge: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  universeError: { color: COLORS.sell, fontSize: 12, marginTop: 4 },
  buildingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buildingText: { flex: 1, color: COLORS.text, fontSize: 13 },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnOutline: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary,
    paddingHorizontal: 16, paddingVertical: 10, minWidth: 120,
  },
  btnOutlineText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  note: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
