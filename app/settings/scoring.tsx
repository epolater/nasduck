import { Stack } from 'expo-router';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, CRITERIA_WEIGHTS } from '../../constants';
import { useSettingsStore } from '../../store/settingsStore';
import { registerWithServer } from '../../services/serverSync';

// Human-readable label for each criterion id
const CRITERION_LABELS: Record<string, string> = {
  volume_spike:             'Volume Spike',
  macd_crossover_up:        'MACD Crossover Up',
  macd_crossover_down:      'MACD Crossover Down',
  ema_crossover_up:         'EMA Crossover Up',
  ema_crossover_down:       'EMA Crossover Down',
  bollinger_breakout_up:    'Bollinger Breakout Up',
  bollinger_breakout_down:  'Bollinger Breakdown',
  price_surge:              'Price Surge',
  gap_up:                   'Gap Up',
  gap_down:                 'Gap Down',
  new_52w_high:             'New 52-Week High',
  new_52w_low:              'New 52-Week Low',
  rsi_oversold:             'RSI Oversold',
  rsi_overbought:           'RSI Overbought',
  atr_spike:                'ATR Spike',
  obv_trend_up:             'OBV Trending Up',
  obv_trend_down:           'OBV Trending Down',
  stoch_oversold:           'Stochastic Oversold',
  stoch_overbought:         'Stochastic Overbought',
  trending_up:              'Trending Up',
  trending_down:            'Trending Down',
  above_sma50:              'Price Above SMA50',
  below_sma50:              'Price Below SMA50',
  price_vs_ema_above:       'Price Above EMA',
  price_vs_ema_below:       'Price Below EMA',
  adx_strong:               'ADX Strong Trend',
  inside_bar:               'Inside Bar',
  volume_dryup:             'Volume Dry-Up',
  put_call_ratio_low:       'Low Put/Call Ratio',
  put_call_ratio_high:      'High Put/Call Ratio',
  high_iv:                  'High Implied Volatility',
  near_max_pain:            'Near Max Pain',
};

const ORDERED_IDS = Object.keys(CRITERIA_WEIGHTS);

export default function ScoringScreen() {
  const { criteriaWeights, serverRegistered, save } = useSettingsStore();

  // Merge defaults with saved overrides
  const weights: Record<string, number> = { ...CRITERIA_WEIGHTS, ...criteriaWeights };

  async function saveAndSync(newWeights: Record<string, number>) {
    await save({ criteriaWeights: newWeights });
    if (serverRegistered) registerWithServer(); // fire-and-forget
  }

  function setWeight(id: string, value: number) {
    const clamped = Math.max(1, Math.min(10, value));
    saveAndSync({ ...weights, [id]: clamped });
  }

  function handleReset() {
    Alert.alert(
      'Reset to Defaults',
      'Reset all scoring weights to their default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => saveAndSync({ ...CRITERIA_WEIGHTS }),
        },
      ],
    );
  }

  // Check if any weight differs from default
  const isModified = ORDERED_IDS.some(id => weights[id] !== CRITERIA_WEIGHTS[id]);

  return (
    <>
      <Stack.Screen options={{ title: 'Scoring Weights' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          Adjust how much each criterion contributes to the final buy score. Higher weight = bigger impact.
        </Text>

        {ORDERED_IDS.map((id, index) => {
          const w = weights[id] ?? CRITERIA_WEIGHTS[id];
          const isDefault = w === CRITERIA_WEIGHTS[id];
          return (
            <View
              key={id}
              style={[
                styles.row,
                index === 0 && styles.rowFirst,
                index === ORDERED_IDS.length - 1 && styles.rowLast,
              ]}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.label}>{CRITERION_LABELS[id] ?? id}</Text>
                {!isDefault && (
                  <Text style={styles.modified}>modified</Text>
                )}
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity
                  style={[styles.stepBtn, w <= 1 && styles.stepBtnDisabled]}
                  onPress={() => setWeight(id, w - 1)}
                  disabled={w <= 1}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.stepBtnText, w <= 1 && styles.stepBtnTextDisabled]}>−</Text>
                </TouchableOpacity>
                <Text style={styles.weightValue}>{w}</Text>
                <TouchableOpacity
                  style={[styles.stepBtn, w >= 10 && styles.stepBtnDisabled]}
                  onPress={() => setWeight(id, w + 1)}
                  disabled={w >= 10}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.stepBtnText, w >= 10 && styles.stepBtnTextDisabled]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <TouchableOpacity
          style={[styles.resetBtn, !isModified && styles.resetBtnDisabled]}
          onPress={handleReset}
          disabled={!isModified}
          activeOpacity={0.8}
        >
          <Text style={[styles.resetText, !isModified && styles.resetTextDisabled]}>
            Reset to Defaults
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  hint: {
    color: COLORS.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 1,
  },
  rowFirst: { borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  rowLast: { borderBottomLeftRadius: 12, borderBottomRightRadius: 12, marginBottom: 0 },
  rowLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  modified: {
    color: COLORS.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    backgroundColor: `${COLORS.primary}22`,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceAlt,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: { opacity: 0.3 },
  stepBtnText: { color: COLORS.text, fontSize: 18, lineHeight: 22, fontWeight: '600' },
  stepBtnTextDisabled: { color: COLORS.textMuted },
  weightValue: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: '700',
    width: 24,
    textAlign: 'center',
  },
  resetBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: COLORS.sell,
    alignItems: 'center',
  },
  resetBtnDisabled: { backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border },
  resetText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resetTextDisabled: { color: COLORS.textMuted },
});
