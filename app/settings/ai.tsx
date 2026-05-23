import { useState } from 'react';
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
import { useSettingsStore } from '../../store/settingsStore';
import { testAiConnection, AI_MODELS } from '../../services/ai';

export default function AiScreen() {
  const { aiModel, googleAiKey, groqKey, save } = useSettingsStore();
  const [aiTestStatus, setAiTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [aiTestResult, setAiTestResult] = useState('');

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'AI Analysis' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Text style={styles.sectionLabel}>AI ANALYSIS</Text>
        <Text style={styles.sectionDesc}>
          Used for AI stock analysis on the detail screen. All models have free tiers.
        </Text>

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
  subLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 12, marginBottom: 6 },
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
  btnOutline: {
    backgroundColor: 'transparent', borderWidth: 1, borderColor: COLORS.primary,
    paddingHorizontal: 16, paddingVertical: 10, minWidth: 120,
  },
  btnOutlineText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  modelRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 8,
  },
  modelRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '10' },
  modelName: { color: COLORS.text, fontWeight: '700', fontSize: 14, marginBottom: 2 },
  modelDesc: { color: COLORS.textSecondary, fontSize: 12 },
  testResultCard: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 14, marginTop: 10,
    borderWidth: 1, borderColor: COLORS.primary + '55',
  },
  testResultError: { borderColor: COLORS.sell + '55' },
  testResultText: {
    color: COLORS.primary, fontSize: 12, lineHeight: 20,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
