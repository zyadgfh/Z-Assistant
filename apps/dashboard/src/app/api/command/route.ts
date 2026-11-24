import { NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import {
  decide,
  extractAfterWakeWord,
  MAYA_GUARD_SYSTEM_PROMPT,
  OmniRouteGateway,
  parseCommand,
  planActions,
} from "@maya/core";
import type { DeviceAction } from "@maya/core";
import { GeminiClient } from "@maya/core";

import { checkRateLimit, rateLimitHeaders } from "@/lib/rateLimit";

/**
 * The web tier of the Maya pipeline: text in (typed or browser-transcribed
 * voice) -> core router -> permission engine -> web-executable actions.
 *
 * Web-safe actions are only `open_url`; `open_application`, `open_folder`,
 * `take_screenshot` and `play_song` come back as `deviceActions` for the
 * device client to run — the web never executes OS operations.
 *
 * Voice mode passes requireWakeWord=true so ambient utterances are ignored
 * unless they begin with the wake word (plan section 4.1).
 */

interface CommandBody {
  text?: unknown;
  mode?: unknown;
  requireWakeWord?: unknown;
  storeTranscript?: unknown;
}

const MAX_TEXT_LENGTH = 300;
// Per-instance ceiling; deterministic intents are cheap but Gemini calls are not.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 60 * 1000 };

export async function POST(request: Request) {
  const started = Date.now();
  const rate = checkRateLimit(request, RATE_LIMIT);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: "تجاوزت حد الطلبات لهذه الساعة؛ جرب لاحقًا." },
      { status: 429, headers: rateLimitHeaders(rate) },
    );
  }

  let body: CommandBody;
  try {
    body = (await request.json()) as CommandBody;
  } catch {
    return NextResponse.json({ error: "طلب غير صالح." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
  const mode = body.mode === "voice" ? "voice" : "text";
  const requireWakeWord = body.requireWakeWord !== false;
  const storeTranscript = body.storeTranscript === true;

  if (!text) {
    return NextResponse.json({ error: "لم يصل نص الأمر." }, { status: 400 });
  }

  // Wake word gate for voice mode (one source of truth: the core).
  let commandText = text;
  if (requireWakeWord) {
    const afterWake = extractAfterWakeWord(text);
    if (afterWake === null) {
      return NextResponse.json({ stage: "ignored", intent: null, actions: [], deviceActions: [] });
    }
    if (!afterWake) {
      return NextResponse.json({ stage: "no_command", intent: null, actions: [], deviceActions: [] });
    }
    commandText = afterWake;
  }

  const intent = parseCommand(commandText);
  const decision = decide(intent);

  if (decision.action === "reject") {
    return NextResponse.json({
      stage: "rejected",
      intent: intent.name,
      reason: decision.reason,
      actions: [],
      deviceActions: [],
    });
  }

  if (decision.action !== "execute") {
    return NextResponse.json({
      stage: decision.action === "confirm" ? "needs_confirmation" : "needs_auth",
      intent: intent.name,
      reason: decision.reason,
      actions: [],
      deviceActions: [],
    });
  }

  if (intent.name === "ai_query") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({
        stage: "answered",
        intent: intent.name,
        reply:
          "الأجوبة السحابية غير مهيأة على الخادم بعد: أضف GEMINI_API_KEY في Vercel ثم أعد النشر. بين الأوامر المعروفة تعمل بشكل كامل.",
        actions: [],
        deviceActions: [],
      });
    }
    const gateway = new OmniRouteGateway({ adapters: [new GeminiClient({ apiKey })] });
    try {
      const reply = await gateway.route({
        prompt: intent.args.prompt ?? commandText,
        system: MAYA_GUARD_SYSTEM_PROMPT,
        sensitivity: "safe",
        locale: intent.locale === "en" ? "en" : "ar",
      });
      return NextResponse.json({
        stage: "answered",
        intent: intent.name,
        reply: reply.text,
        actions: [],
        deviceActions: [],
      });
    } catch (error) {
      return NextResponse.json({
        stage: "failed",
        intent: intent.name,
        reason: error instanceof Error ? error.message : "فشل غير معروف.",
        actions: [],
        deviceActions: [],
      });
    }
  }

  const allActions = planActions(intent);
  const webActions = allActions.filter((action) => action.kind === "open_url" || action.kind === "speak");
  const deviceActions: DeviceAction[] = allActions.filter((action) => action.kind !== "open_url" && action.kind !== "speak");

  await logCommand(request, {
    mode,
    transcript: storeTranscript ? text : null,
    intent: intent.name,
    risk: intent.risk,
    latencyMs: Date.now() - started,
  });

  return NextResponse.json({
    stage: "executed",
    intent: intent.name,
    actions: webActions,
    deviceActions,
  });
}

async function logCommand(
  request: Request,
  entry: {
    mode: "voice" | "text";
    transcript: string | null;
    intent: string;
    risk: "safe" | "sensitive" | "high";
    latencyMs: number;
  },
): Promise<void> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("voice_commands").insert({
      user_id: user.id,
      channel: entry.mode,
      intent: entry.intent,
      risk: entry.risk,
      status: "executed",
      latency_ms: entry.latencyMs,
      transcript: entry.transcript,
    });
  } catch {
    // Logging must never break the command path (plan section 13).
  }
}
