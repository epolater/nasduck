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
  optionsData?: {
    pcr: number | null;
    maxPain: number | null;
    ivAvg: number | null;
    ivRank: number | null;
    expiryDate: string | null;
  };
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

  const o = input.optionsData;
  const optionsSection = o ? `
Options Flow (nearest expiry${o.expiryDate ? ' ' + o.expiryDate : ''}):
  Put/Call Ratio: ${o.pcr != null ? o.pcr.toFixed(2) + (o.pcr < 0.7 ? ' (bullish — more calls)' : o.pcr > 1.0 ? ' (bearish — more puts)' : ' (neutral)') : 'N/A'}
  IV Rank: ${o.ivRank != null ? o.ivRank + '%' + (o.ivRank > 60 ? ' (elevated — big move expected)' : ' (normal)') : 'N/A'}
  Avg Implied Volatility: ${o.ivAvg != null ? (o.ivAvg * 100).toFixed(1) + '%' : 'N/A'}
  Max Pain: ${o.maxPain != null ? '$' + o.maxPain.toFixed(2) + ' (price likely gravitates here at expiry)' : 'N/A'}` : '';

  return `You are a stock market analyst. Analyze the following stock data and provide a concise assessment.

Stock: ${input.symbol} (${input.name})
Current Price: $${input.price.toFixed(2)}
Daily Change: ${input.changePct >= 0 ? '+' : ''}${input.changePct.toFixed(2)}%
Market Cap: ${capStr}
Volume: ${volStr}
52W High: ${input.high52w ? '$' + input.high52w.toFixed(2) : 'N/A'}
52W Low: ${input.low52w ? '$' + input.low52w.toFixed(2) : 'N/A'}
Recent 10-day closes (oldest to newest): ${priceHistory}
Matched technical signals: ${criteria}${optionsSection}

Respond ONLY with valid JSON in this exact format, no markdown, no extra text:
{
  "sentiment": "bullish" or "bearish" or "neutral",
  "summary": "2-3 sentence analysis of price action, technicals${o ? ' and options flow' : ''}",
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

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithAi(
  messages: ChatMessage[],
  systemContext: string,
  modelId: AiModelId,
  googleKey: string,
  groqKey: string,
): Promise<string> {
  const model = AI_MODELS.find(m => m.id === modelId)!;

  if (model.provider === 'google') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${googleKey}`;
    const contents = [
      { role: 'user', parts: [{ text: systemContext }] },
      { role: 'model', parts: [{ text: 'Understood. I\'m ready to answer questions about this stock.' }] },
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    ];
    const { data } = await axios.post(url, {
      contents,
      generationConfig: { temperature: 0.5, maxOutputTokens: 1024 },
    }, { timeout: 20000 });
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.';
  } else {
    const { data } = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
      model: modelId,
      messages: [
        { role: 'system', content: systemContext },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      temperature: 0.5,
      max_tokens: 1024,
    }, {
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      timeout: 20000,
    });
    return data.choices?.[0]?.message?.content ?? 'No response.';
  }
}

export function buildStockContext(input: StockAnalysisInput, analysisResult?: AiAnalysisResult | null): string {
  const capStr = input.marketCap ? `$${(input.marketCap / 1e9).toFixed(2)}B` : 'N/A';
  const volStr = input.volume ? `${(input.volume / 1e6).toFixed(2)}M` : 'N/A';
  const priceHistory = input.recentCloses.map((p, i) => `Day ${i + 1}: $${p.toFixed(2)}`).join(', ');
  const o = input.optionsData;

  let context = `You are a stock market analyst assistant. Here is the data for ${input.symbol} (${input.name}):

Price: $${input.price.toFixed(2)} (${input.changePct >= 0 ? '+' : ''}${input.changePct.toFixed(2)}% today)
Market Cap: ${capStr} | Volume: ${volStr}
52W High: ${input.high52w ? '$' + input.high52w.toFixed(2) : 'N/A'} | 52W Low: ${input.low52w ? '$' + input.low52w.toFixed(2) : 'N/A'}
Recent 10-day closes (oldest→newest): ${priceHistory}
Matched signals: ${input.matchedCriteria.length > 0 ? input.matchedCriteria.join(', ') : 'None'}`;

  if (o) {
    context += `\nOptions (nearest expiry${o.expiryDate ? ' ' + o.expiryDate : ''}): PCR=${o.pcr?.toFixed(2) ?? 'N/A'}, IV Rank=${o.ivRank ?? 'N/A'}%, IV Avg=${o.ivAvg != null ? (o.ivAvg * 100).toFixed(1) + '%' : 'N/A'}, Max Pain=${o.maxPain != null ? '$' + o.maxPain.toFixed(2) : 'N/A'}`;
  }

  if (analysisResult) {
    context += `\n\nPrevious AI analysis: Verdict=${analysisResult.verdict}, Sentiment=${analysisResult.sentiment}. Summary: ${analysisResult.summary} Risks: ${analysisResult.risks}`;
  }

  context += '\n\nAnswer the user\'s questions about this stock concisely and clearly. Use the data above — do not make up information not present here.';
  return context;
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
