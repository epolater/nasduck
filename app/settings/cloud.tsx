import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { COLORS } from '../../constants';
import { useSettingsStore } from '../../store/settingsStore';
import { registerWithServer } from '../../services/serverSync';
import { useServerLogStore } from '../../store/serverLogStore';

export default function CloudScreen() {
  const { serverRegistered, save } = useSettingsStore();
  const [serverStatus, setServerStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [serverMsg, setServerMsg] = useState('');
  const [logExpanded, setLogExpanded] = useState(false);
  const { logs, clear: clearLogs } = useServerLogStore();
  const logScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (logExpanded) setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 50);
  }, [logs.length, logExpanded]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Cloud Scan' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.sectionLabel}>CLOUD SCAN</Text>
        <Text style={styles.sectionDesc}>
          Scan runs on a server in the background — even when your phone is off. You get a push notification when signals are found.
        </Text>

        <View style={styles.cloudRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cloudTitle}>Enable Cloud Scan</Text>
            <Text style={styles.cloudSub}>
              {serverRegistered
                ? '✓ Registered — server scans at your scheduled time'
                : 'Tap to register this device with the scan server'}
            </Text>
          </View>
          <Switch
            value={serverRegistered}
            onValueChange={async (val) => {
              if (val) {
                setServerStatus('loading');
                setServerMsg('');
                const res = await registerWithServer();
                if (res.ok) {
                  await save({ serverRegistered: true });
                  setServerStatus('ok');
                  setServerMsg(res.message ?? 'Registered!');
                } else {
                  setServerStatus('error');
                  setServerMsg(res.error ?? 'Failed to connect');
                }
              } else {
                await save({ serverRegistered: false });
                setServerStatus('idle');
                setServerMsg('');
              }
            }}
            trackColor={{ false: COLORS.border, true: COLORS.primary }}
            thumbColor={serverRegistered ? '#fff' : COLORS.textMuted}
            disabled={serverStatus === 'loading'}
          />
        </View>

        {serverStatus === 'loading' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <ActivityIndicator size="small" color={COLORS.primary} />
            <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>Connecting to server…</Text>
          </View>
        )}

        {serverMsg !== '' && serverStatus !== 'loading' && (
          <View style={[styles.testResult, { borderColor: serverStatus === 'ok' ? COLORS.buy : COLORS.sell }]}>
            <Text style={{ color: serverStatus === 'ok' ? COLORS.buy : COLORS.sell, fontSize: 13 }}>
              {serverStatus === 'ok' ? '✓ ' : '⚠️ '}{serverMsg}
            </Text>
          </View>
        )}

        {serverRegistered && (
          <>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.logHeaderRow} onPress={() => setLogExpanded(v => !v)}>
              <Text style={styles.sectionLabel}>SERVER LOG</Text>
              <View style={styles.logHeaderRight}>
                {logs.length > 0 && !logExpanded && (
                  <Text style={styles.logBadge}>{logs.length}</Text>
                )}
                {logs.length > 0 && logExpanded && (
                  <TouchableOpacity onPress={clearLogs} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.logClearBtn}>Clear</Text>
                  </TouchableOpacity>
                )}
                <Text style={styles.logChevron}>{logExpanded ? '▲' : '▼'}</Text>
              </View>
            </TouchableOpacity>
            {logExpanded && (
              <View style={styles.logBox}>
                <ScrollView
                  ref={logScrollRef}
                  style={styles.logScroll}
                  contentContainerStyle={{ paddingBottom: 8 }}
                  showsVerticalScrollIndicator={false}
                >
                  {logs.length === 0
                    ? <Text style={styles.logEmpty}>No log entries yet. Logs appear here when a cloud scan runs.</Text>
                    : logs.map((l, i) => (
                      <Text key={i} style={[styles.logLine,
                        l.type === 'ok' && { color: COLORS.buy },
                        l.type === 'err' && { color: COLORS.sell },
                      ]}>
                        <Text style={styles.logTime}>{l.time}{'  '}</Text>{l.msg}
                      </Text>
                    ))
                  }
                </ScrollView>
              </View>
            )}
          </>
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
  sectionDesc: { color: COLORS.textSecondary, fontSize: 13, marginBottom: 10, lineHeight: 18 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  cloudRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  cloudTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  cloudSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  testResult: {
    marginTop: 8, padding: 10, borderRadius: 8,
    borderWidth: 1, backgroundColor: COLORS.surface,
  },
  logHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  logHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logBadge: {
    backgroundColor: COLORS.primary + '22', color: COLORS.primary,
    fontSize: 11, fontWeight: '700', paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: 10, overflow: 'hidden',
  },
  logChevron: { color: COLORS.textMuted, fontSize: 12 },
  logClearBtn: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  logBox: {
    backgroundColor: '#0d0d0d', borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    height: 240, marginBottom: 4,
  },
  logScroll: { flex: 1, paddingHorizontal: 12, paddingTop: 8 },
  logEmpty: { color: COLORS.textMuted, fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  logLine: { color: COLORS.textSecondary, fontSize: 11, fontFamily: 'monospace', marginBottom: 3, lineHeight: 16 },
  logTime: { color: COLORS.textMuted, fontSize: 10 },
});
