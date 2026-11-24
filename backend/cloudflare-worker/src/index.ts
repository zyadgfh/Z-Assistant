/**
 * Maya Cloudflare Worker — the only place where the Gemini API key exists.
 *
 * Endpoints:
 *   GET  /health          → liveness + configuration state (no secrets).
 *   POST /v1/assistant    → text in, structured intent + Arabic reply out.
 *   POST /v1/transcribe   → reserved; returns a clear 501 in v1 (local STT only).
 *
 * Guarantees: validated requests, daily per-IP rate limit, scoped CORS, no raw
 * audio or user text in logs, no secret leakage, no shell execution anywhere.
 */

import type { Env } from "./env.d.js";
import { GeminiClient } from "./gemini_client.js";
import { INTENT_RISK, parseIntent, replyFor } from "./intents.js";
import { DailyRateLimiter } from "./rate_limiter.js";
import { clientIp, validateBody, validateContentType } from "./request_validation.js";
import { corsHeaders, errorJson, jsonResponse } from "./respond.js";

function allowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS ?? "http://localhost:3000,http://127.0.0.1:3000";
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== "*");
}

/**
 * One limiter per isolate: module-level state survives across requests, which
 * makes the daily ceiling meaningful. It resets on deploy or when the env
 * ceiling changes (documented limit); for exact global counting bind Workers
 * KV or a Durable Object.
 */
let cachedLimiter: { limit: number; limiter: DailyRateLimiter } | null = null;
function getLimiter(env: Env): DailyRateLimiter {
  const parsed = Number.parseInt(env.DAILY_REQUEST_LIMIT ?? "200", 10);
  const limit = Number.isFinite(parsed) && parsed > 0 ? parsed : 200;
  if (!cachedLimiter || cachedLimiter.limit !== limit) {
    cachedLimiter = { limit, limiter: new DailyRateLimiter(limit) };
  }
  return cachedLimiter.limiter;
}

function rateHeaders(state: { limit: number; remaining: number; resetAt: string }): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(state.limit),
    "X-RateLimit-Remaining": String(state.remaining),
    "X-RateLimit-Reset": state.resetAt,
  };
}

async function handleAssistant(request: Request, env: Env): Promise<Response> {
  const cors = corsHeaders(allowedOrigins(env), request);

  const contentTypeError = validateContentType(request);
  if (contentTypeError) {
    return errorJson(contentTypeError.status, contentTypeError.code, contentTypeError.message, cors);
  }

  const limiter = getLimiter(env);
  const ipKey = clientIp(request);
  const state = limiter.consume(ipKey);
  if (!state.allowed) {
    return errorJson(429, "rate_limited", "تجاوزت الحد اليومي للطلبات؛ جرب غدًا أو اعتمد الأوامر المحلية.", {
      ...cors,
      ...rateHeaders(state),
    });
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return errorJson(400, "unreadable_body", "تعذر قراءة محتوى الطلب.", cors);
  }
  const validated = validateBody(raw);
  if (!validated.ok) {
    return errorJson(validated.error.status, validated.error.code, validated.error.message, {
      ...cors,
      ...rateHeaders(state),
    });
  }
  const { text, locale } = validated.value;
  const requestId = crypto.randomUUID();

  // 1) Deterministic intents first: safe commands work even when Gemini is down.
  const localIntent = parseIntent(text);
  if (localIntent) {
    return jsonResponse(
      {
        requestId,
        replyText: replyFor(localIntent),
        replyLanguage: "ar-EG",
        intent: localIntent.name,
        arguments: localIntent.args,
        risk: localIntent.risk,
        requiresConfirmation: localIntent.risk === "sensitive",
      },
      { headers: { ...cors, ...rateHeaders(state) } },
    );
  }

  // 2) Unknown request → Gemini, single attempt, validated against the whitelist.
  const gemini = new GeminiClient({
    apiKey: env.GEMINI_API_KEY,
    model: env.GEMINI_MODEL ?? "gemini-2.5-flash",
  });
  try {
    const answer = await gemini.ask(text, locale);
    const intent = answer.intent;
    const risk = intent ? (INTENT_RISK[intent] ?? "safe") : "safe";
    return jsonResponse(
      {
        requestId,
        replyText: answer.replyText,
        replyLanguage: answer.replyLanguage || (locale === "en" ? "en" : "ar-EG"),
        intent,
        arguments: answer.args,
        risk,
        requiresConfirmation: risk === "sensitive",
      },
      { headers: { ...cors, ...rateHeaders(state) } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل غير معروف.";
    return errorJson(502, "ai_unavailable", message, { ...cors, ...rateHeaders(state) });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(allowedOrigins(env), request);
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method === "GET" && pathname === "/health") {
      const gemini = new GeminiClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL ?? "gemini-2.5-flash" });
      return jsonResponse(
        {
          ok: true,
          service: "maya-worker",
          aiConfigured: gemini.configured,
          time: new Date().toISOString(),
        },
        { headers: cors },
      );
    }

    if (request.method === "POST" && pathname === "/v1/assistant") {
      return handleAssistant(request, env);
    }

    if (request.method === "POST" && pathname === "/v1/transcribe") {
      // Reserved for future server-side transcription; v1 keeps STT on-device.
      return errorJson(501, "not_implemented", "تحويل الصوت على الخادم غير مفعّل في الإصدار الأول؛ استخدم التعرف المحلي على الجهاز.", cors);
    }

    return errorJson(404, "not_found", "المسار غير موجود.", cors);
  },
};
