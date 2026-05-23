import {
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
import { useSettingsStore } from '../../store/settingsStore';
import { registerWithServer } from '../../services/serverSync';

export default function ScanScreen() {
  const { scanHour, scanMinute, minChangePct, serverRegistered, save } = useSettingsStore();

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = [0, 15, 30, 45];

  const timeLabel = `${String(scanHour).padStart(2, '0')}:${String(scanMinute).padStart(2, '0')}`;

  async function handleScanTimeChange(hour: number, minute: number) {
    await save({ scanHour: hour, scanMinute: minute });
    if (serverRegistered) {
      registerWithServer().catch(() => {});
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Scan Settings' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        {/* Scan Time */}
        <Text style={styles.sectionLabel}>DAILY SCAN TIME</Text>
        <Text style={styles.sectionDesc}>
          {serverRegistered
            ? 'Server scans automatically at this time (US Eastern, weekdays). App will be notified with results.'
            : 'The app will auto-scan when opened at or after this time each day. A reminder notification is also sent.'}
        </Text>
        <Text style={styles.timeDisplay}>{timeLabel}</Text>

        <Text style={styles.subLabel}>Hour</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerRow}>
          {hourOptions.map((h) => (
            <TouchableOpacity
              key={h}
              style={[styles.pickerChip, scanHour === h && styles.pickerChipActive]}
              onPress={() => handleScanTimeChange(h, scanMinute)}
            >
              <Text style={[styles.pickerChipText, scanHour === h && styles.pickerChipTextActive]}>
                {String(h).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.subLabel}>Minute</Text>
        <View style={styles.minuteRow}>
          {minuteOptions.map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.pickerChip, scanMinute === m && styles.pickerChipActive]}
              onPress={() => handleScanTimeChange(scanHour, m)}
            >
              <Text style={[styles.pickerChipText, scanMinute === m && styles.pickerChipTextActive]}>
                :{String(m).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.divider} />

        {/* Min Change % */}
        <Text style={styles.sectionLabel}>MINIMUM PRICE CHANGE</Text>
        <Text style={styles.sectionDesc}>
          Stocks with an absolute daily move below this threshold are skipped. Helps filter out flat penny-stock noise.
        </Text>
        <View style={styles.stepperRow}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => save({ minChangePct: Math.max(0, parseFloat((minChangePct - 0.5).toFixed(1))) })}
          >
            <Text style={styles.stepperBtnText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.stepperValue}>{minChangePct.toFixed(1)}%</Text>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => save({ minChangePct: Math.min(10, parseFloat((minChangePct + 0.5).toFixed(1))) })}
          >
            <Text style={styles.stepperBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>0% = no filter. 1% = default (removes stocks that barely moved).</Text>

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
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  timeDisplay: {
    color: COLORS.primary, fontSize: 40, fontWeight: '800',
    textAlign: 'center', marginVertical: 8,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  subLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
  pickerRow: { flexDirection: 'row' },
  minuteRow: { flexDirection: 'row', gap: 10 },
  pickerChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  pickerChipActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  pickerChipText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  pickerChipTextActive: { color: COLORS.primary },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    marginBottom: 8, alignSelf: 'flex-start',
  },
  stepperBtn: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperBtnText: { color: COLORS.primary, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  stepperValue: {
    color: COLORS.text, fontSize: 24, fontWeight: '700', minWidth: 60, textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  note: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
