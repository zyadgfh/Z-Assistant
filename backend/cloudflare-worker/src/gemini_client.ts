/**
 * Gemini client for the worker. Single attempt, no infinite retries; failures
 * become clear Arabic errors without leaking the API key or provider internals.
 *
 * The model must answer with strict JSON: {intent, arguments, replyText,
 * replyLanguage}. Intents outside the whitelist are rejected here so the model
 * can never trigger an unexecuted or arbitrary command path.
 */

import { INTENT_ARGS, normalizeText, validateArgs } from "./intents.js";

export interface GeminiAnswer {
  intent: string | null;
  args: Record<string, string>;
  replyText: string;
  replyLanguage: string;
}

interface GeminiWireResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export const GUARD_PROMPT = [
  "أنت Maya، مساعدة صوتية للجهاز. مهمتك تحويل طلب المستخدم إلى JSON واحد فقط بالشكل:",
  '{"intent":"<اسم النية>","arguments":{"...":"..."},"replyText":"<رد قصير بلغة المستخدم ولهجته>","replyLanguage":"ar-EG|ar|en"}',
  "النيات المسموحة فقط: open_application, open_url, search_google, search_youtube, take_screenshot,",
  "volume_up, volume_down, open_folder, play_local_music, close_application, send_message,",
  "delete_file, change_setting, open_private_file, answer.",
  "إذا كان الطلب سؤالًا أو غير قابل للتحويل، استخدم intent=answer واكتب الإجابة في replyText.",
  "لا تخترع نية خارج القائمة، ولا ترجع أوامر نظام أو مسارات shell، ولا تدّع تنفيذ أفعال.",
  "أرجع JSON فقط دون أي نص إضافي.",
].join("\n");

export class GeminiClient {
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: {
    apiKey?: string | undefined;
    model?: string;
    baseUrl?: string;
    fetchImpl?: typeof fetch;
  }) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-2.5-flash";
    this.baseUrl = options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async ask(userText: string, locale: string): Promise<GeminiAnswer> {
    if (!this.apiKey) {
      throw new Error("Gemini غير مهيأ على الخادم؛ الأوامر المحلية تعمل والأسئلة الذكية معطلة مؤقتًا.");
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "x-goog-api-key": this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userText }] }],
          systemInstruction: { parts: [{ text: GUARD_PROMPT }] },
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 512, temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      throw new Error("تعذر الوصول إلى Gemini؛ تحقق من الاتصال بالإنترنت.");
    }

    const raw = await response.text();
    let parsed: GeminiWireResponse;
    try {
      parsed = JSON.parse(raw) as GeminiWireResponse;
    } catch {
      throw new Error(`رد غير مفهوم من Gemini (HTTP ${response.status}).`);
    }
    if (!response.ok) {
      const detail = parsed.error?.status === "RESOURCE_EXHAUSTED" || response.status === 429
        ? "نفدت حصة Gemini اليومية؛ جرب لاحقًا أو اعتمد الأوامر المحلية."
        : `فشل Gemini برمز الحالة ${response.status}.`;
      throw new Error(detail);
    }
    if (parsed.promptFeedback?.blockReason) {
      throw new Error("حجب أمان Gemini للطلب.");
    }
    const text = (parsed.candidates?.[0]?.content?.parts ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!text) {
      throw new Error("لم يُرجع Gemini نصًا.");
    }

    return this.parseAnswer(text);
  }

  /** Validate the model JSON against the whitelist; fail closed on anything else. */
  parseAnswer(modelText: string): GeminiAnswer {
    let candidate: unknown;
    try {
      candidate = JSON.parse(modelText);
    } catch {
      throw new Error("رد Gemini ليس JSON صالحًا.");
    }
    const body = candidate as { intent?: unknown; arguments?: unknown; replyText?: unknown; replyLanguage?: unknown };

    const replyText = typeof body.replyText === "string" ? body.replyText.trim().slice(0, 500) : "";
    const replyLanguage = typeof body.replyLanguage === "string" ? body.replyLanguage.slice(0, 10) : "ar-EG";
    const intentName = typeof body.intent === "string" ? body.intent.trim() : "";

    if (intentName === "answer" || (!intentName && replyText)) {
      return { intent: null, args: {}, replyText: replyText || "لا أستطيع الإجابة الآن.", replyLanguage };
    }
    if (!(intentName in INTENT_ARGS)) {
      // The model invented an intent: answer-only, execute nothing.
      return { intent: null, args: {}, replyText: replyText || "هذا الطلب خارج الأوامر المدعومة حاليًا.", replyLanguage };
    }
    const args = validateArgs(intentName, (body.arguments as Record<string, unknown>) ?? {});
    if (args === null) {
      return { intent: null, args: {}, replyText: "تعذرت التحقق من معطيات الطلب؛ لن يُنفَّذ شيء.", replyLanguage };
    }
    return { intent: intentName, args, replyText: replyText || "تم", replyLanguage };
  }
}

/** Deterministic check used by tests to keep the parser parity with the core. */
export function workerUnderstands(text: string): boolean {
  return normalizeText(text).length > 0;
}
