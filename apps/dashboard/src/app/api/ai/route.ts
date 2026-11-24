import { NextResponse } from "next/server";

import { GeminiClient, MAYA_GUARD_SYSTEM_PROMPT } from "@maya/core";
import { OmniRouteGateway } from "@maya/core";

import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

/**
 * Server-side AI route — the only place where GEMINI_API_KEY exists.
 * The key is read from the server environment (Vercel env vars) and is never
 * exposed to the browser. Web questions are safe-tier by definition: typed
 * text, no personal data, and the Maya guard prompt forbids claiming device
 * execution (plan sections 2.4 and 10).
 */
const MAX_PROMPT_LENGTH = 500;
// Per-instance ceiling against Gemini cost abuse while the route is unauthenticated.
const RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  const rate = checkRateLimit(request, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "تجاوزت حد استخدام الذكاء الاصطناعي لهذه الساعة؛ جرب لاحقًا." },
      { status: 429, headers: rateLimitHeaders(rate) },
    );
  }

  let prompt = "";
  try {
    const body = (await request.json()) as { prompt?: unknown };
    prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "اكتب سؤالًا أولًا." }, { status: 400 });
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `السؤال طويل جدًا (الحد ${MAX_PROMPT_LENGTH} حرفًا).` },
      { status: 400 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Gemini غير مهيأ على الخادم: أضف GEMINI_API_KEY في إعدادات مشروع Vercel، ثم أعد النشر. يعمل بقية النظام بالنموذج المحلي دون هذا المفتاح.",
      },
      { status: 503 },
    );
  }

  // On the web tier there is no local model, so the gateway holds the real
  // Gemini client only. Failures surface as clear Arabic errors, never silent.
  const gateway = new OmniRouteGateway({
    adapters: [new GeminiClient({ apiKey })],
  });

  try {
    const reply = await gateway.route({
      prompt,
      system: MAYA_GUARD_SYSTEM_PROMPT,
      sensitivity: "safe",
      locale: "ar",
    });
    return NextResponse.json({ reply: reply.text, provider: reply.provider, latencyMs: reply.latencyMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "فشل غير معروف.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
