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
import { Stack } from 'expo-router';
import { COLORS } from '../../constants';
import { validateApiKey } from '../../services/finnhub';
import { requestNotificationPermissions } from '../../services/notifications';
import { useSettingsStore } from '../../store/settingsStore';

type KeyStatus = 'unchecked' | 'valid' | 'invalid' | 'checking';

export default function FinnhubScreen() {
  const { apiKey, save } = useSettingsStore();
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keyStatus, setKeyStatus] = useState<KeyStatus>(apiKey ? 'unchecked' : 'invalid');

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

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Finnhub API Key' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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

        {keyStatus === 'invalid' && (
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
  btnText: { color: '#000', fontWeight: '700', fontSize: 15 },
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
  keyErrorCard: {
    backgroundColor: '#ff475718', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#ff475755', marginBottom: 10,
  },
  keyErrorText: { color: COLORS.sell, fontSize: 13, lineHeight: 18 },
});
