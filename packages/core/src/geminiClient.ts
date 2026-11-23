/**
 * Real Gemini provider transport for OmniRoute (plan sections 2.4, 3, and 11
 * stage 3). Uses the REST surface `POST /v1beta/models/{model}:generateContent`
 * with the `x-goog-api-key` header.
 *
 * Rules honored here:
 *  - The API key is injected by the host (device app or server route) from its
 *    own environment. It never lives in this repository or in client bundles.
 *  - Quota is consumed through the shared QuotaTracker, and 429 responses mark
 *    the provider unavailable so the gateway falls back to the local model
 *    without infinite retries (plan section 2.4 items 3-6).
 *  - Sensitive payloads are blocked upstream by the gateway unless the user
 *    consented; this transport adds the Maya guard system prompt so the model
 *    answers questions only and never claims to execute device actions.
 */

import type { ModelAdapter, ProviderReply, ProviderRequest } from "./types";
import { QuotaTracker } from "./providerRouter";

export const MAYA_GUARD_SYSTEM_PROMPT =
  "أجب بلغة المستخدم. لا تدّع تنفيذ أفعال على الجهاز؛ أنت تجيب فقط عن الأسئلة.";

/** Structural fetch/response types so the core stays DOM-free. */
export interface GeminiHttpResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<GeminiHttpResponse>;

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export interface GeminiClientOptions {
  apiKey: string | undefined;
  /** e.g. `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.0-flash`. */
  model?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
  quota?: QuotaTracker;
  timeoutMs?: number;
}

export interface GeminiWireError {
  error?: { code?: number; message?: string; status?: string };
}

export interface GeminiWireResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export function classifyGeminiFailure(status: number, body: GeminiWireError): string {
  const apiStatus = body.error?.status ?? "";
  const apiMessage = body.error?.message ?? "";
  if (status === 429 || apiStatus === "RESOURCE_EXHAUSTED") {
    return "نفدت حصة Gemini لهذا المفتاح؛ سيُعاد التوجيه إلى النموذج المحلي.";
  }
  if (status === 400 && /API key not valid|API_KEY_INVALID/i.test(apiMessage)) {
    return "مفتاح Gemini غير صالح؛ تحقق من GEMINI_API_KEY على الجهاز أو الخادم.";
  }
  if (status === 403) {
    return "رفض Gemini للطلب (403)؛ تحقق من صلاحيات المفتاح والنموذج المطلوب.";
  }
  return apiMessage
    ? `فشل Gemini (${status}): ${apiMessage}`
    : `فشل Gemini برمز الحالة ${status}.`;
}

export function extractGeminiText(body: GeminiWireResponse): string {
  const blocked = body.promptFeedback?.blockReason;
  if (blocked) {
    throw new Error(`حجب أمان Gemini للطلب (${blocked}).`);
  }
  const parts = body.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) {
    const finish = body.candidates?.[0]?.finishReason;
    throw new Error(finish ? `لم يُرجع Gemini نصًا (السبب: ${finish}).` : "لم يُرجع Gemini نصًا.");
  }
  return text;
}

/**
 * ModelAdapter implementation with a real HTTP transport. The fetch
 * implementation is injectable so tests exercise the full error taxonomy
 * without touching the network.
 */
export class GeminiClient implements ModelAdapter {
  readonly name = "gemini";
  private readonly apiKey: string | undefined;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly quota: QuotaTracker | undefined;
  private readonly timeoutMs: number;

  constructor(options: GeminiClientOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gemini-2.5-flash";
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as Promise<GeminiHttpResponse>);
    this.quota = options.quota;
    this.timeoutMs = options.timeoutMs ?? 45_000;
  }

  /** Usable only with a key and remaining local quota. */
  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) return false;
    return this.quota ? this.quota.remaining(this.name) > 0 : true;
  }

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    if (!this.apiKey) {
      throw new Error(
        "لم يتم ضبط GEMINI_API_KEY؛ أضف المفتاح في بيئة الجهاز أو الخادم، أو اعتمد النموذج المحلي فقط.",
      );
    }
    if (this.quota && !this.quota.tryConsume(this.name)) {
      throw new Error(`quota exhausted for ${this.name}`);
    }

    const url = `${this.baseUrl}/models/${this.model}:generateContent`;
    const started = Date.now();
    const body = JSON.stringify({
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      systemInstruction: {
        parts: [{ text: request.system ?? MAYA_GUARD_SYSTEM_PROMPT }],
      },
    });

    const response = await this.fetchWithTimeout(url, body);
    const raw = await response.text();
    let parsed: GeminiWireResponse & GeminiWireError;
    try {
      parsed = JSON.parse(raw) as GeminiWireResponse & GeminiWireError;
    } catch {
      throw new Error(`رد غير مفهوم من Gemini (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(classifyGeminiFailure(response.status, parsed));
    }

    const text = extractGeminiText(parsed);
    return { text, provider: this.name, latencyMs: Date.now() - started };
  }

  private fetchWithTimeout(url: string, body: string): Promise<GeminiHttpResponse> {
    const attempt = this.fetchImpl(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey ?? "",
        "Content-Type": "application/json",
      },
      body,
    });
    return Promise.race([
      attempt,
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("انتهت مهلة الطلب إلى Gemini.")), this.timeoutMs),
      ),
    ]).catch((error: unknown) => {
      if (error instanceof TypeError) {
        // fetch() throws TypeError on network failure (offline, DNS, ...).
        throw new Error("تعذر الوصول إلى Gemini؛ تحقق من الاتصال بالإنترنت.");
      }
      throw error;
    });
  }
}
