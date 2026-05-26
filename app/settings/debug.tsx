import { useState } from 'react';
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
import { COLORS, CLOUD_SERVER_URL } from '../../constants';
import { fetchCandles } from '../../services/finnhub';
import { fetchOptionsData } from '../../services/options';
import { getDeviceId } from '../../services/serverSync';
import axios from 'axios';

type Status = 'idle' | 'loading' | 'ok' | 'error';

interface TestResult {
  status: Status;
  output: string;
}

const INIT: TestResult = { status: 'idle', output: '' };

export default function DebugScreen() {
  const [yahoo, setYahoo]     = useState<TestResult>(INIT);
  const [options, setOptions] = useState<TestResult>(INIT);
  const [server, setServer]   = useState<TestResult>(INIT);

  async function testYahoo() {
    setYahoo({ status: 'loading', output: '' });
    try {
      const candles = await fetchCandles('AAPL', 'D', 0, 0);
      if (!candles || candles.close.length < 2) {
        setYahoo({ status: 'error', output: 'Returned no candle data for AAPL.' });
        return;
      }
      const n = candles.close.length;
      const last = candles.close[n - 1];
      const prev = candles.close[n - 2];
      const chg  = prev > 0 ? (((last - prev) / prev) * 100).toFixed(2) : '?';
      setYahoo({
        status: 'ok',
        output:
          `✓ ${n} candles received\n` +
          `Latest close: $${last?.toFixed(2)}\n` +
          `1-day change: ${chg}%\n` +
          `Market cap:   ${candles.marketCap ? '$' + (candles.marketCap / 1e12).toFixed(2) + 'T' : 'n/a'}\n` +
          `Last date:    ${new Date(candles.timestamp[n - 1] * 1000).toDateString()}`,
      });
    } catch (e: any) {
      setYahoo({ status: 'error', output: `Error: ${e?.message ?? String(e)}` });
    }
  }

  async function testOptions() {
    setOptions({ status: 'loading', output: '' });
    try {
      const data = await fetchOptionsData('AAPL');
      if (data.pcr == null && data.ivAvg == null && data.maxPain == null) {
        setOptions({ status: 'error', output: 'All fields null — marketdata.app returned no data.\nMay be rate-limited (100 req/day free tier).' });
      } else {
        setOptions({
          status: 'ok',
          output:
            `✓ Options data for AAPL\n` +
            `Expiry:   ${data.expiryDate ?? 'n/a'}\n` +
            `PCR:      ${data.pcr != null ? data.pcr.toFixed(2) : 'n/a'}\n` +
            `Max Pain: ${data.maxPain != null ? '$' + data.maxPain.toFixed(2) : 'n/a'}\n` +
            `IV Avg:   ${data.ivAvg != null ? (data.ivAvg * 100).toFixed(1) + '%' : 'n/a'}\n` +
            `IV Rank:  ${data.ivRank ?? 'n/a'}`,
        });
      }
    } catch (e: any) {
      setOptions({ status: 'error', output: `Error: ${e?.message ?? String(e)}` });
    }
  }

  async function testServer() {
    setServer({ status: 'loading', output: '' });
    try {
      const deviceId = getDeviceId();
      const res = await axios.get(`${CLOUD_SERVER_URL}/status/${deviceId}`, { timeout: 8000 });
      const d = res.data;
      setServer({
        status: 'ok',
        output:
          `✓ Server reachable\n` +
          `Device ID:  ${deviceId}\n` +
          `Scan status: ${d.phase ?? (d.scanning ? 'scanning' : 'idle')}\n` +
          `Progress:   ${d.progress}/${d.total}\n` +
          `Last scan:  ${d.lastScanAt ? new Date(d.lastScanAt).toLocaleString() : 'never'}\n` +
          `Signals:    ${d.lastSignals?.length ?? 0}`,
      });
    } catch (e: any) {
      const status = (e as any)?.response?.status;
      if (status === 404) {
        setServer({ status: 'error', output: 'Device not registered with server.\nGo to Settings → Cloud Scan and enable it.' });
      } else {
        setServer({ status: 'error', output: `Error: ${e?.message ?? String(e)}` });
      }
    }
  }

  async function testAll() {
    await Promise.all([testYahoo(), testOptions(), testServer()]);
  }

  const anyLoading = [yahoo, options, server].some(r => r.status === 'loading');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Debug & Diagnostics' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.pageDesc}>
          Test each data source independently to diagnose connectivity issues.
        </Text>

        <TouchableOpacity
          style={[styles.testAllBtn, anyLoading && { opacity: 0.5 }]}
          onPress={testAll}
          disabled={anyLoading}
        >
          {anyLoading
            ? <><ActivityIndicator size="small" color="#000" style={{ marginRight: 8 }} /><Text style={styles.testAllText}>Running…</Text></>
            : <Text style={styles.testAllText}>▶ Test All</Text>
          }
        </TouchableOpacity>

        <TestBlock
          label="YAHOO FINANCE — CANDLES"
          desc="Historical price data (no API key needed)"
          buttonText="Test Candles"
          result={yahoo}
          onPress={testYahoo}
        />

        <TestBlock
          label="MARKETDATA.APP — OPTIONS"
          desc="Put/call ratio, max pain, IV (no API key, 100 req/day free)"
          buttonText="Test Options (AAPL)"
          result={options}
          onPress={testOptions}
        />

        <TestBlock
          label="CLOUD SERVER"
          desc="Checks if your device is registered and server is reachable"
          buttonText="Test Server"
          result={server}
          onPress={testServer}
        />

        <View style={styles.divider} />
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <Text style={styles.about}>
          Nasduck v2.0{'\n'}
          Price data: Yahoo Finance{'\n'}
          Options data: marketdata.app{'\n'}
          Symbol universe: NASDAQ Screener{'\n'}
          Not financial advice.
        </Text>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function TestBlock({
  label, desc, buttonText, result, onPress,
}: {
  label: string;
  desc: string;
  buttonText: string;
  result: TestResult;
  onPress: () => void;
}) {
  const isLoading = result.status === 'loading';
  const color = result.status === 'ok' ? COLORS.primary : result.status === 'error' ? COLORS.sell : COLORS.primary;

  return (
    <View style={styles.block}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <Text style={styles.sectionDesc}>{desc}</Text>
      <TouchableOpacity
        style={[styles.btn, isLoading && { opacity: 0.5 }]}
        onPress={onPress}
        disabled={isLoading}
      >
        {isLoading
          ? <ActivityIndicator size="small" color={COLORS.primary} />
          : <Text style={styles.btnText}>{buttonText}</Text>
        }
      </TouchableOpacity>
      {result.output !== '' && (
        <View style={[styles.resultCard, { borderColor: color + '55' }]}>
          <Text style={[styles.resultText, { color }]}>{result.output}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 60 },
  pageDesc: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 16 },
  testAllBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingVertical: 13, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', marginBottom: 28,
  },
  testAllText: { color: '#000', fontWeight: '800', fontSize: 14 },
  block: { marginBottom: 24 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.5, marginBottom: 4,
  },
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  btn: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignSelf: 'flex-start', minWidth: 160, alignItems: 'center',
  },
  btnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  resultCard: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, marginTop: 10,
    borderWidth: 1,
  },
  resultText: {
    fontSize: 12, lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  about: { color: COLORS.textSecondary, fontSize: 13, lineHeight: 22 },
});
