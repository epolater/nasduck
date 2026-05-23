import { useRef, useEffect, useCallback } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Stack } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { COLORS } from '../../constants';
import { useSettingsStore } from '../../store/settingsStore';
import { registerWithServer } from '../../services/serverSync';

const ITEM_H = 52;
const VISIBLE = 5; // must be odd
const PICKER_H = ITEM_H * VISIBLE;

interface WheelPickerProps {
  values: number[];
  selected: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}

function WheelPicker({ values, selected, format, onChange }: WheelPickerProps) {
  const ref = useRef<ScrollView>(null);
  const selectedIndex = values.indexOf(selected);

  // Scroll to selected on mount and when selected changes externally
  useEffect(() => {
    const idx = values.indexOf(selected);
    if (idx >= 0) {
      ref.current?.scrollTo({ y: idx * ITEM_H, animated: false });
    }
  }, [selected, values]);

  const handleScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    const idx = Math.round(y / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, idx));
    if (values[clamped] !== selected) onChange(values[clamped]);
  }, [values, selected, onChange]);

  const pad = Math.floor(VISIBLE / 2) * ITEM_H;

  return (
    <View style={styles.wheel}>
      {/* Selection highlight */}
      <View style={styles.wheelHighlight} pointerEvents="none" />
      <ScrollView
        ref={ref}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: pad }}
        onMomentumScrollEnd={handleScrollEnd}
        scrollEventThrottle={16}
      >
        {values.map((v, i) => {
          const isSelected = v === selected;
          return (
            <View key={v} style={styles.wheelItem}>
              <Text style={[styles.wheelText, isSelected && styles.wheelTextSelected]}>
                {format ? format(v) : String(v).padStart(2, '0')}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

export default function ScanScreen() {
  const { scanHour, scanMinute, scanWeekends, minChangePct, serverRegistered, save } = useSettingsStore();

  const timeLabel = `${String(scanHour).padStart(2, '0')}:${String(scanMinute).padStart(2, '0')}`;

  async function handleScanTimeChange(hour: number, minute: number) {
    await save({ scanHour: hour, scanMinute: minute });
    if (serverRegistered) {
      registerWithServer().catch(() => {});
      // Reschedule the background wakeup notification to the new time
      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: { title: 'Nasduck', body: 'Starting scan…', data: { type: 'server_wakeup' } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute,
        },
      });
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
            : 'The app will auto-scan when opened at or after this time each day.'}
        </Text>

        <View style={styles.pickerContainer}>
          <WheelPicker
            values={HOURS}
            selected={scanHour}
            onChange={(h) => handleScanTimeChange(h, scanMinute)}
          />
          <Text style={styles.colon}>:</Text>
          <WheelPicker
            values={MINUTES}
            selected={scanMinute}
            onChange={(m) => handleScanTimeChange(scanHour, m)}
          />
        </View>

        <Text style={styles.timeLabel}>{timeLabel} ET</Text>

        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>Scan on weekends</Text>
            <Text style={styles.toggleSub}>Markets are closed but scan still runs</Text>
          </View>
          <Switch
            value={scanWeekends}
            onValueChange={(v) => {
              save({ scanWeekends: v });
              if (serverRegistered) registerWithServer().catch(() => {});
            }}
            trackColor={{ false: COLORS.border, true: COLORS.primary + '88' }}
            thumbColor={scanWeekends ? COLORS.primary : COLORS.textMuted}
          />
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
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 16, lineHeight: 18 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },

  pickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: PICKER_H,
    marginBottom: 10,
  },
  wheel: {
    width: 90,
    height: PICKER_H,
    overflow: 'hidden',
  },
  wheelHighlight: {
    position: 'absolute',
    top: ITEM_H * Math.floor(VISIBLE / 2),
    left: 0, right: 0,
    height: ITEM_H,
    backgroundColor: COLORS.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
  },
  wheelItem: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    color: COLORS.textMuted,
    fontSize: 28,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  wheelTextSelected: {
    color: COLORS.primary,
    fontSize: 34,
    fontWeight: '800',
  },
  colon: {
    color: COLORS.primary,
    fontSize: 36,
    fontWeight: '800',
    marginHorizontal: 8,
    marginBottom: 4,
  },
  timeLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },

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
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 12,
  },
  toggleLabel: { color: COLORS.text, fontWeight: '600', fontSize: 14 },
  toggleSub: { color: COLORS.textMuted, fontSize: 11, marginTop: 2 },
});
