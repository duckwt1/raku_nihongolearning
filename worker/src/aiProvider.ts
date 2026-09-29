/**
 * Abstract AI Provider and Google Gemini API implementation (Section 8.3 & 5B.4).
 * Supports structured JSON responses and strict anti-prompt-injection data isolation.
 */

export interface AiGenerateOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  responseSchema?: Record<string, unknown>;
}

export interface AiProvider {
  name: string;
  generateText(options: AiGenerateOptions): Promise<string>;
}

export class GeminiAiProvider implements AiProvider {
  name = 'Google Gemini';
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateText(options: AiGenerateOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const body: Record<string, unknown> = {
      systemInstruction: {
        parts: [{ text: options.systemPrompt }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: options.userPrompt }]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
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
  }
}
