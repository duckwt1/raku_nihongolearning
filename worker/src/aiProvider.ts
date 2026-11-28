/**
 * Abstract AI Provider with:
 * - OpenAiCompatibleAiProvider (Groq, xAI Grok, OpenRouter, DeepSeek, OpenAI)
 * - GeminiAiProvider (Google AI Studio & Cloudflare AI Gateway via GEMINI_BASE_URL)
 * Supports multi-turn history, structured JSON schema guidance, timeout protection,
 * and strict anti-prompt-injection data isolation.
 */

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';
export const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const DEFAULT_GROQ_MODEL = 'qwen/qwen3.8-27b';
export const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';
export const DEFAULT_XAI_MODEL = 'grok-3-mini';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const DEFAULT_OPENROUTER_MODEL = 'google/gemini-2.5-flash';
export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export interface AiConversationTurn {
  role: 'user' | 'model';
  text: string;
}

export interface AiGenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  history?: AiConversationTurn[];
  temperature?: number;
  responseSchema?: Record<string, unknown>;
  thinkingBudget?: number;
  timeoutMs?: number;
}

export interface AiProvider {
  name: string;
  model: string;
  generateText(options: AiGenerateOptions): Promise<string>;
}

export interface AiProviderEnv {
  AI_PROVIDER?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  GROQ_API_KEY?: string;
  XAI_API_KEY?: string;
  GROK_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GEMINI_BASE_URL?: string;
  CF_AIG_TOKEN?: string;
}

/**
 * Converts a Gemini-style OpenAPI responseSchema into a compact example/contract
 * string so OpenAI-compatible models (Groq, Grok, OpenRouter, DeepSeek) follow
 * the exact JSON keys and value types reliably.
 */
export function buildJsonSchemaHint(schema: Record<string, unknown>): string {
  function describe(node: Record<string, unknown>): unknown {
    const type = String(node.type || '').toUpperCase();
    if (type === 'OBJECT') {
      const props = (node.properties || {}) as Record<string, Record<string, unknown>>;
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        out[k] = describe(v);
      }
      return out;
    }
    if (type === 'ARRAY') {
      const items = (node.items || {}) as Record<string, unknown>;
      return [describe(items)];
    }
    if (type === 'BOOLEAN') return true;
    if (type === 'INTEGER' || type === 'NUMBER') return 0;
    if (Array.isArray(node.enum) && node.enum.length > 0) {
      return node.enum.join(' | ');
    }
    return 'string';
  }

  return `\n\nĐỊNH DẠNG JSON BẮT BUỘC (chỉ trả về duy nhất 1 JSON object hợp lệ khớp chính xác tên các trường sau, không thêm giải thích ngoài JSON):\n${JSON.stringify(describe(schema), null, 2)}`;
}

export class GeminiAiProvider implements AiProvider {
  name = 'Google Gemini';
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private cfAigToken?: string;

  constructor(
    apiKey: string,
    model = DEFAULT_GEMINI_MODEL,
    options: { baseUrl?: string; cfAigToken?: string } = {}
  ) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = (options.baseUrl?.trim() || DEFAULT_GEMINI_BASE_URL).replace(/\/+$/, '');
    this.cfAigToken = options.cfAigToken?.trim() || undefined;
  }

  async generateText(options: AiGenerateOptions): Promise<string> {
    const url = `${this.baseUrl}/v1beta/models/${this.model}:generateContent`;

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    if (options.history && options.history.length > 0) {
      for (const turn of options.history) {
        const text = turn.text.trim();
        if (!text) continue;
        contents.push({
          role: turn.role,
          parts: [{ text }]
        });
      }
    }
    contents.push({
      role: 'user',
      parts: [{ text: options.userPrompt }]
    });

    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.2,
      responseMimeType: 'application/json',
      ...(options.responseSchema ? { responseSchema: options.responseSchema } : {})
    };

    if (
      typeof options.thinkingBudget === 'number' &&
      this.model.toLowerCase().includes('gemini-2.5')
    ) {
      generationConfig.thinkingConfig = {
        thinkingBudget: Math.max(0, Math.trunc(options.thinkingBudget))
      };
    }

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }]
      },
      contents,
      generationConfig
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-goog-api-key': this.apiKey
    };
    if (this.cfAigToken) {
      headers['cf-aig-authorization'] = `Bearer ${this.cfAigToken}`;
    }

    const timeoutMs = options.timeoutMs ?? 25000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini API error [${response.status}]: ${errText}`);
      }

      const json = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Mô hình AI không trả về dữ liệu nội dung hợp lệ.');
      }

      return text;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Kết nối tới AI quá thời gian chờ (25 giây). Vui lòng thử lại.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

export class OpenAiCompatibleAiProvider implements AiProvider {
  name: string;
  model: string;
  private apiKey: string;
  private baseUrl: string;
  private extraHeaders: Record<string, string>;

  constructor(options: {
    name?: string;
    apiKey: string;
    baseUrl: string;
    model: string;
    extraHeaders?: Record<string, string>;
  }) {
    this.name = options.name || 'OpenAI-Compatible AI';
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.model = options.model;
    this.extraHeaders = options.extraHeaders || {};
  }

  async generateText(options: AiGenerateOptions): Promise<string> {
    const url = this.baseUrl.endsWith('/chat/completions')
      ? this.baseUrl
      : `${this.baseUrl}/chat/completions`;

    const schemaHint = options.responseSchema ? buildJsonSchemaHint(options.responseSchema) : '';
    const systemContent = `${options.systemPrompt}${schemaHint}`;

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemContent }
    ];

    if (options.history && options.history.length > 0) {
      for (const turn of options.history) {
        const text = turn.text.trim();
        if (!text) continue;
        messages.push({
          role: turn.role === 'model' ? 'assistant' : 'user',
          content: text
        });
      }
    }
    messages.push({ role: 'user', content: options.userPrompt });

    const expectsJsonObject =
      Boolean(options.responseSchema) &&
      String(options.responseSchema?.type || '').toUpperCase() === 'OBJECT';

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: options.temperature ?? 0.2,
      ...(expectsJsonObject ? { response_format: { type: 'json_object' } } : {})
    };

    const timeoutMs = options.timeoutMs ?? 25000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...this.extraHeaders
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`${this.name} API error [${response.status}]: ${errText}`);
      }

      const json = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
          };
        }>;
      };

      const text = json.choices?.[0]?.message?.content;
      if (!text || !text.trim()) {
        throw new Error('Mô hình AI không trả về dữ liệu nội dung hợp lệ.');
      }

      return text;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Kết nối tới AI quá thời gian chờ (25 giây). Vui lòng thử lại.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Resolves the active AI provider from Cloudflare Worker environment variables.
 * Supports explicit AI_PROVIDER or automatic detection from GROQ_API_KEY,
 * XAI_API_KEY/GROK_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, AI_API_KEY, or GEMINI_API_KEY.
 */
export function resolveAiProvider(env: AiProviderEnv): AiProvider | null {
  const explicit = env.AI_PROVIDER?.trim().toLowerCase();
  const customModel = env.AI_MODEL?.trim();
  const customBaseUrl = env.AI_BASE_URL?.trim();

  const makeGroq = (key: string) =>
    new OpenAiCompatibleAiProvider({
      name: 'Groq',
      apiKey: key,
      baseUrl: customBaseUrl || DEFAULT_GROQ_BASE_URL,
      model: customModel || DEFAULT_GROQ_MODEL
    });

  const makeXai = (key: string) =>
    new OpenAiCompatibleAiProvider({
      name: 'xAI Grok',
      apiKey: key,
      baseUrl: customBaseUrl || DEFAULT_XAI_BASE_URL,
      model: customModel || DEFAULT_XAI_MODEL
    });

  const makeOpenRouter = (key: string) =>
    new OpenAiCompatibleAiProvider({
      name: 'OpenRouter',
      apiKey: key,
      baseUrl: customBaseUrl || DEFAULT_OPENROUTER_BASE_URL,
      model: customModel || DEFAULT_OPENROUTER_MODEL,
      extraHeaders: {
        'HTTP-Referer': 'https://rakunihongo-duckwt.pages.dev',
        'X-Title': 'Raku Nihongo'
      }
    });

  const makeDeepSeek = (key: string) =>
    new OpenAiCompatibleAiProvider({
      name: 'DeepSeek',
      apiKey: key,
      baseUrl: customBaseUrl || DEFAULT_DEEPSEEK_BASE_URL,
      model: customModel || DEFAULT_DEEPSEEK_MODEL
    });

  const makeGemini = (key: string) =>
    new GeminiAiProvider(key, customModel || DEFAULT_GEMINI_MODEL, {
      baseUrl: env.GEMINI_BASE_URL,
      cfAigToken: env.CF_AIG_TOKEN
    });

  if (explicit === 'groq') {
    const key = env.GROQ_API_KEY || env.AI_API_KEY;
    return key ? makeGroq(key) : null;
  }
  if (explicit === 'grok' || explicit === 'xai') {
    const key = env.XAI_API_KEY || env.GROK_API_KEY || env.AI_API_KEY;
    return key ? makeXai(key) : null;
  }
  if (explicit === 'openrouter') {
    const key = env.OPENROUTER_API_KEY || env.AI_API_KEY;
    return key ? makeOpenRouter(key) : null;
  }
  if (explicit === 'deepseek') {
    const key = env.DEEPSEEK_API_KEY || env.AI_API_KEY;
    return key ? makeDeepSeek(key) : null;
  }
  if (explicit === 'openai' || explicit === 'openai-compatible') {
    if (!env.AI_API_KEY) return null;
    return new OpenAiCompatibleAiProvider({
      name: 'OpenAI-Compatible AI',
      apiKey: env.AI_API_KEY,
      baseUrl: customBaseUrl || DEFAULT_GROQ_BASE_URL,
      model: customModel || DEFAULT_GROQ_MODEL
    });
  }
  if (explicit === 'gemini') {
    return env.GEMINI_API_KEY ? makeGemini(env.GEMINI_API_KEY) : null;
  }

  // Auto-detect priority: non-HKG-blocked providers first if configured, then Gemini fallback
  if (env.GROQ_API_KEY) return makeGroq(env.GROQ_API_KEY);
  if (env.XAI_API_KEY || env.GROK_API_KEY) return makeXai((env.XAI_API_KEY || env.GROK_API_KEY)!);
  if (env.OPENROUTER_API_KEY) return makeOpenRouter(env.OPENROUTER_API_KEY);
  if (env.DEEPSEEK_API_KEY) return makeDeepSeek(env.DEEPSEEK_API_KEY);
  if (env.AI_API_KEY) {
    return new OpenAiCompatibleAiProvider({
      name: 'OpenAI-Compatible AI',
      apiKey: env.AI_API_KEY,
      baseUrl: customBaseUrl || DEFAULT_GROQ_BASE_URL,
      model: customModel || DEFAULT_GROQ_MODEL
    });
  }
  if (env.GEMINI_API_KEY) return makeGemini(env.GEMINI_API_KEY);

  return null;
}
