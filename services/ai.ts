import axios from 'axios';

export type AiModelId =
  | 'gemini-2.0-flash'
  | 'gemini-1.5-flash'
  | 'llama-3.3-70b-versatile'
  | 'llama-3.1-8b-instant';

export interface AiModel {
  id: AiModelId;
  name: string;
  provider: 'google' | 'groq';
  description: string;
}

export const AI_MODELS: AiModel[] = [
  { id: 'gemini-2.0-flash',        name: 'Gemini 2.0 Flash',  provider: 'google', description: 'Google — newest, free tier' },
  { id: 'gemini-1.5-flash',        name: 'Gemini 1.5 Flash',  provider: 'google', description: 'Google — stable, free tier' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B',     provider: 'groq',   description: 'Groq — powerful, free tier' },
  { id: 'llama-3.1-8b-instant',    name: 'Llama 3.1 8B',      provider: 'groq',   description: 'Groq — fastest, free tier' },
];

export interface StockAnalysisInput {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  marketCap: number | null;
  volume: number | null;
  high52w: number | null;
  low52w: number | null;
  recentCloses: number[];   // last 10 daily closes, oldest first
  matchedCriteria: string[]; // e.g. ["RSI Oversold: 28.4", "Trending Up: 3 days"]
}

export interface AiAnalysisResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;     // 2-3 sentence analysis
  risks: string;       // 1-2 sentence key risks
  verdict: string;     // one word or short phrase: "Buy", "Sell", "Hold", "Watch"
}

function buildPrompt(input: StockAnalysisInput): string {
  const capStr = input.marketCap ? `$${(input.marketCap / 1e9).toFixed(2)}B` : 'N/A';
  const volStr = input.volume ? `${(input.volume / 1e6).toFixed(2)}M` : 'N/A';
  const priceHistory = input.recentCloses.map((p, i) => `Day ${i + 1}: $${p.toFixed(2)}`).join(', ');
  const criteria = input.matchedCriteria.length > 0 ? input.matchedCriteria.join(', ') : 'None';

  return `You are a stock market analyst. Analyze the following stock data and provide a concise assessment.

Stock: ${input.symbol} (${input.name})
Current Price: $${input.price.toFixed(2)}
Daily Change: ${input.changePct >= 0 ? '+' : ''}${input.changePct.toFixed(2)}%
Market Cap: ${capStr}
Volume: ${volStr}
52W High: ${input.high52w ? '$' + input.high52w.toFixed(2) : 'N/A'}
52W Low: ${input.low52w ? '$' + input.low52w.toFixed(2) : 'N/A'}
Recent 10-day closes (oldest to newest): ${priceHistory}
Matched technical signals: ${criteria}

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "sentiment": "bullish" or "bearish" or "neutral",
  "summary": "2-3 sentence analysis of price action and technicals",
  "risks": "1-2 sentence key risks to watch",
  "verdict": "Buy" or "Sell" or "Hold" or "Watch"
}`;
}

async function callGemini(prompt: string, modelId: string, apiKey: string): Promise<AiAnalysisResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
  const { data } = await axios.post(url, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 512 },
  }, { timeout: 20000 });
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

async function callGroq(prompt: string, modelId: string, apiKey: string): Promise<AiAnalysisResult> {
  const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: modelId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 512,
  }, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 20000,
  });
  const text = data.choices?.[0]?.message?.content ?? '';
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

export async function analyzeStock(
  input: StockAnalysisInput,
  modelId: AiModelId,
  googleKey: string,
  groqKey: string,
): Promise<AiAnalysisResult> {
  const model = AI_MODELS.find(m => m.id === modelId)!;
  const prompt = buildPrompt(input);
  if (model.provider === 'google') return callGemini(prompt, modelId, googleKey);
  return callGroq(prompt, modelId, groqKey);
}

export async function testAiConnection(
  modelId: AiModelId,
  googleKey: string,
  groqKey: string,
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const model = AI_MODELS.find(m => m.id === modelId)!;
  const start = Date.now();
  try {
    if (model.provider === 'google') {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`;
      await axios.post(url, {
        contents: [{ parts: [{ text: 'Reply with just: ok' }] }],
        generationConfig: { maxOutputTokens: 8 },
      }, { timeout: 10000 });
    } else {
      await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: modelId,
        messages: [{ role: 'user', content: 'Reply with just: ok' }],
        max_tokens: 8,
      }, {
        headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
    }
    return { ok: true, latencyMs: Date.now() - start };
  } catch (e: any) {
    return { ok: false, latencyMs: Date.now() - start, error: e?.response?.data?.error?.message ?? e?.message ?? 'Unknown error' };
  }
}
