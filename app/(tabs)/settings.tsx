import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../../constants';
import { isExpoGo, requestNotificationPermissions } from '../../services/notifications';
import { fetchCandles, validateApiKey } from '../../services/finnhub';
import { testAiConnection, AI_MODELS } from '../../services/ai';
import { useScanStore } from '../../store/scanStore';
import { useSettingsStore } from '../../store/settingsStore';
import { abortUniverseBuild, buildUniverse, scheduleDailyNotification } from '../../tasks/dailyScanner';

type KeyStatus = 'unchecked' | 'valid' | 'invalid' | 'checking';
type TestStatus = 'idle' | 'loading' | 'done' | 'error';

export default function SettingsScreen() {
  const { apiKey, scanHour, scanMinute, minChangePct, aiModel, googleAiKey, groqKey, save } = useSettingsStore();
  const { universe, universeBuild, skipList } = useScanStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(apiKey ? 'unchecked' : 'invalid');
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');
  const [testResult, setTestResult] = useState<string>('');
  const [aiTestStatus, setAiTestStatus] = useState<'idle'|'loading'|'ok'|'error'>('idle');
  const [aiTestResult, setAiTestResult] = useState('');
  const isBuilding = universeBuild.status === 'running';

  const hourOptions = Array.from({ length: 24 }, (_, i) => i);
  const minuteOptions = [0, 15, 30, 45];

  // Validate the stored key on mount
  useEffect(() => {
    if (apiKey) {
      setKeyStatus('checking');
      validateApiKey(apiKey).then((ok) => setKeyStatus(ok ? 'valid' : 'invalid'));
    }
  }, []);

  async function handleSaveApiKey() {
    const key = apiKeyInput.trim();
    if (!key) return;
    setKeyStatus('checking');
    const ok = await validateApiKey(key);
    if (ok) {
      await save({ apiKey: key });
      await requestNotificationPermissions();
      setApiKeyInput('');
      setKeyStatus('valid');
    } else {
      setKeyStatus('invalid');
    }
  }

  function handleChangeKey() {
    setApiKeyInput('');
    setKeyStatus('invalid');
  }

  function handleBuildUniverse() {
    buildUniverse(); // fire and forget — progress tracked in store
  }

  async function handleScanTimeChange(hour: number, minute: number) {
    await save({ scanHour: hour, scanMinute: minute });
    await scheduleDailyNotification(hour, minute);
  }

  async function handleTestApi() {
    setTestStatus('loading');
    setTestResult('');
    try {
      const candles = await fetchCandles('AAPL', 'D', 0, 0);
      if (!candles) {
        setTestResult('Yahoo Finance returned null for AAPL.\nCheck your internet connection.');
        setTestStatus('error');
      } else {
        const n = candles.close.length;
        const last = candles.close[n - 1];
        const prev = candles.close[n - 2];
        const gain = prev > 0 ? (((last - prev) / prev) * 100).toFixed(2) : '?';
        setTestResult(
          `✓ Got ${n} daily candles for AAPL\n` +
          `Latest close:  $${last?.toFixed(2)}\n` +
          `Prev close:    $${prev?.toFixed(2)}\n` +
          `1-day change:  ${gain}%\n` +
          `Last date: ${new Date(candles.timestamp[n - 1]).toDateString()}`
        );
        setTestStatus('done');
      }
    } catch (e: any) {
      setTestResult(`Error: ${e?.message ?? String(e)}`);
      setTestStatus('error');
    }
  }

  const universeAge = universe.lastUpdated
    ? Math.floor((Date.now() - universe.lastUpdated) / 86400000)
    : null;

  const timeLabel = `${String(scanHour).padStart(2, '0')}:${String(scanMinute).padStart(2, '0')}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

        {/* API Key */}
        <Text style={styles.sectionLabel}>FINNHUB API KEY</Text>

        {keyStatus === 'checking' && (
          <View style={styles.keyStatusCard}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={styles.keyStatusText}>Verifying API key…</Text>
          </View>
        )}

        {keyStatus === 'valid' && (
          <View style={styles.keyConnectedCard}>
            <Text style={styles.keyConnectedIcon}>✓</Text>
            <Text style={styles.keyConnectedText}>Connected to Finnhub</Text>
            <TouchableOpacity onPress={handleChangeKey} style={styles.changeKeyBtn}>
              <Text style={styles.changeKeyText}>Change</Text>
            </TouchableOpacity>
          </View>
        )}

        {(keyStatus === 'invalid') && (
          <>
            {apiKey !== '' && (
              <View style={styles.keyErrorCard}>
                <Text style={styles.keyErrorText}>⚠️ API key is not working. Please enter a valid key.</Text>
              </View>
            )}
            <Text style={styles.sectionDesc}>
              Free at{' '}
              <Text style={styles.link} onPress={() => Linking.openURL('https://finnhub.io')}>
                finnhub.io
              </Text>
              {' '}— 60 calls/min on free tier
            </Text>
            <TextInput
              style={styles.input}
              value={apiKeyInput}
              onChangeText={setApiKeyInput}
              placeholder="Paste your Finnhub API key"
              placeholderTextColor={COLORS.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.btn, !apiKeyInput.trim() && { opacity: 0.5 }]}
              onPress={handleSaveApiKey}
              disabled={!apiKeyInput.trim()}
            >
              <Text style={styles.btnText}>Save &amp; Verify</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.divider} />

        {/* Scan Universe */}
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
            onPress={handleBuildUniverse}
            disabled={!apiKey || isBuilding}
          >
            <Text style={styles.btnOutlineText}>
              {universe.stocks.length > 0 ? 'Refresh' : 'Build Universe'}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.note}>
          Fetches all NASDAQ common stocks (≤4 char symbols). Price/volume filtering happens automatically during the first scan via the skip list.
        </Text>

        <View style={styles.divider} />

        {/* Scan Time */}
        <Text style={styles.sectionLabel}>DAILY SCAN TIME</Text>
        <Text style={styles.sectionDesc}>
          The app will auto-scan when opened at or after this time each day. A reminder notification is also sent.
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

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>AI ANALYSIS</Text>
        <Text style={styles.sectionDesc}>
          Used for AI stock analysis on the detail screen. All models have free tiers.
        </Text>

        {/* Model picker */}
        <Text style={styles.subLabel}>Model</Text>
        {AI_MODELS.map((m) => (
          <TouchableOpacity
            key={m.id}
            style={[styles.modelRow, aiModel === m.id && styles.modelRowActive]}
            onPress={() => save({ aiModel: m.id })}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.modelName, aiModel === m.id && { color: COLORS.primary }]}>{m.name}</Text>
              <Text style={styles.modelDesc}>{m.description}</Text>
            </View>
            {aiModel === m.id && <Text style={{ color: COLORS.primary, fontWeight: '700' }}>✓</Text>}
          </TouchableOpacity>
        ))}

        {/* Google AI key */}
        <Text style={[styles.subLabel, { marginTop: 16 }]}>Google AI Studio Key</Text>
        <Text style={styles.sectionDesc}>
          Required for Gemini models. Free at{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://aistudio.google.com/apikey')}>
            aistudio.google.com
          </Text>
        </Text>
        <TextInput
          style={styles.input}
          value={googleAiKey}
          onChangeText={(v) => save({ googleAiKey: v.trim() })}
          placeholder="Paste Google AI Studio key"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {/* Groq key */}
        <Text style={[styles.subLabel, { marginTop: 8 }]}>Groq API Key</Text>
        <Text style={styles.sectionDesc}>
          Required for Llama models. Free at{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('https://console.groq.com/keys')}>
            console.groq.com
          </Text>
        </Text>
        <TextInput
          style={styles.input}
          value={groqKey}
          onChangeText={(v) => save({ groqKey: v.trim() })}
          placeholder="Paste Groq API key"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {/* Test button */}
        <TouchableOpacity
          style={[styles.btn, styles.btnOutline, aiTestStatus === 'loading' && { opacity: 0.5 }]}
          onPress={async () => {
            setAiTestStatus('loading');
            setAiTestResult('');
            const result = await testAiConnection(aiModel, googleAiKey, groqKey);
            setAiTestStatus(result.ok ? 'ok' : 'error');
            setAiTestResult(result.ok
              ? `✓ Connected — ${result.latencyMs}ms`
              : `✗ ${result.error}`);
          }}
          disabled={aiTestStatus === 'loading'}
        >
          {aiTestStatus === 'loading'
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.btnOutlineText}>Test AI Connection</Text>}
        </TouchableOpacity>
        {aiTestResult !== '' && (
          <View style={[styles.testResultCard, aiTestStatus === 'error' && styles.testResultError]}>
            <Text style={[styles.testResultText, aiTestStatus === 'error' && { color: COLORS.sell }]}>
              {aiTestResult}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>API DEBUG</Text>
        <Text style={styles.sectionDesc}>Fetch 10 days of AAPL candles to verify Finnhub is working.</Text>
        <TouchableOpacity
          style={[styles.btn, styles.btnOutline, (!apiKey || testStatus === 'loading') && { opacity: 0.4 }]}
          onPress={handleTestApi}
          disabled={!apiKey || testStatus === 'loading'}
        >
          {testStatus === 'loading'
            ? <ActivityIndicator size="small" color={COLORS.primary} />
            : <Text style={styles.btnOutlineText}>Test AAPL Candles</Text>
          }
        </TouchableOpacity>
        {testResult !== '' && (
          <View style={[styles.testResultCard, testStatus === 'error' && styles.testResultError]}>
            <Text style={[styles.testResultText, testStatus === 'error' && { color: COLORS.sell }]}>
              {testResult}
            </Text>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>ABOUT</Text>
        <Text style={styles.about}>
          Nasduck v2.0{'\n'}
          Stock data by Finnhub.io{'\n'}
          Not financial advice.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
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
    letterSpacing: 1.5, marginBottom: 6,
  },
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  link: { color: COLORS.primary },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.text, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  btn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  btnSuccess: { backgroundColor: COLORS.primaryDark },
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
  btnOutline: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary,
    paddingHorizontal: 16, paddingVertical: 10, minWidth: 120,
  },
  btnOutlineText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  universeInfo: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 8,
  },
  universeCount: { color: COLORS.text, fontWeight: '700', fontSize: 16 },
  universeAge: { color: COLORS.textSecondary, fontSize: 12, marginTop: 2 },
  note: { color: COLORS.textMuted, fontSize: 11, lineHeight: 16, marginTop: 4 },
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
  about: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 22 },
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
  keyStatusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 10,
  },
  keyStatusText: { color: COLORS.textSecondary, fontSize: 13 },
  keyConnectedCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.primary + '18', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.primary + '55', marginBottom: 10,
  },
  keyConnectedIcon: { color: COLORS.primary, fontSize: 18, fontWeight: '700', marginRight: 8 },
  keyConnectedText: { flex: 1, color: COLORS.primary, fontWeight: '600', fontSize: 14 },
  changeKeyBtn: { paddingHorizontal: 10, paddingVertical: 4 },
  changeKeyText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' },
  buildingCard: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.primary + '55', marginBottom: 8,
  },
  buildingTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  buildingText: { flex: 1, color: COLORS.text, fontSize: 13 },
  stopText: { color: COLORS.sell, fontWeight: '700', fontSize: 13 },
  progressBar: {
    height: 3, backgroundColor: COLORS.border, borderRadius: 2, marginTop: 12, overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: COLORS.primary, borderRadius: 2 },
  universeError: { color: COLORS.sell, fontSize: 12, marginTop: 4 },
  keyErrorCard: {
    backgroundColor: '#ff475718', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#ff475755', marginBottom: 10,
  },
  keyErrorText: { color: COLORS.sell, fontSize: 13, lineHeight: 18 },
  testResultCard: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: COLORS.primary + '55',
  },
  testResultError: { borderColor: COLORS.sell + '55' },
  testResultText: {
    color: COLORS.primary, fontSize: 12, lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  modelRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  modelName: { color: COLORS.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  modelDesc: { color: COLORS.textSecondary, fontSize: 12 },
});

