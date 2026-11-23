/**
 * Maya device agent CLI — reference client for macOS/Windows/Linux.
 *
 * Sign-in options (env):
 *   MAYA_ACCESS_TOKEN          Supabase access token (from dashboard login)
 *   MAYA_DEVICE_NAME           device label (default: hostname)
 *   MAYA_CAPTURE_SECONDS       utterance length (default 8, max 15)
 *   MAYA_AUDIO_DEVICE          platform mic input override
 *   NEXT_PUBLIC_SUPABASE_URL   project URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY / MAYA_PUBLISHABLE_KEY
 *   GEMINI_API_KEY             optional cloud fallback via OmniRoute
 *
 * Requires a local Whisper CLI (stt/requirements.txt). Push-to-talk: press
 * Enter, speak, and Maya answers/acts; say «مايا، أوقف مايا» to exit.
 */

import { OmniRouteGateway, LocalModelAdapter, MayaPipeline } from "@maya/core";
import type { ModelAdapter, SpeechToText } from "@maya/core";
import { GeminiClient } from "@maya/core";
import { WhisperCliAdapter } from "@maya/core";
import { hostname } from "node:os";

import { MayaAgent } from "./agent.js";
import { ActionsExecutor } from "./actions.js";
import { CliRecorder } from "./recorder.js";
import { createSyncClient, DeviceSync, toDbPlatform } from "./supabaseSync.js";
import type { DeviceAgentConfig } from "./supabaseSync.js";
import { detectPlatform } from "./platform.js";

export const AGENT_VERSION = "0.1.0";

function loadConfig(): DeviceAgentConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.MAYA_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const accessToken = process.env.MAYA_ACCESS_TOKEN;
  if (!supabaseUrl || !publishableKey || !accessToken) return null;
  return {
    supabaseUrl,
    publishableKey,
    accessToken,
    deviceName: process.env.MAYA_DEVICE_NAME || hostname(),
  };
}

function buildStt(): SpeechToText {
  const model = process.env.MAYA_WHISPER_MODEL || "small";
  const binary = process.env.MAYA_WHISPER_BINARY || "whisper";
  return new WhisperCliAdapter({ binary: binary as "whisper", model: model as "small" });
}

function buildGateway(): OmniRouteGateway {
  const adapters: ModelAdapter[] = [new LocalModelAdapter()];
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) adapters.push(new GeminiClient({ apiKey }));
  // Local-first order is enforced by the gateway itself.
  return new OmniRouteGateway({ adapters });
}

export async function runAgent(): Promise<number> {
  const config = loadConfig();
  const platform = detectPlatform();
  const syncClient = config ? createSyncClient(config) : null;
  const sync = new DeviceSync({ client: syncClient, config: config ?? { supabaseUrl: "", publishableKey: "", accessToken: "", deviceName: "" } });

  const stt = buildStt();
  const pipeline = new MayaPipeline({
    stt,
    gateway: buildGateway(),
    sink: {
      record: (entry) => sync.logCommand(entry),
    },
  });
  const executor = new ActionsExecutor({ platform, screenshotDir: process.cwd() });
  const recorder = new CliRecorder({ platform, audioDevice: process.env.MAYA_AUDIO_DEVICE });
  const agent = new MayaAgent({
    pipeline,
    stt,
    recorder,
    executor,
    captureSeconds: Number(process.env.MAYA_CAPTURE_SECONDS || 8),
    onTurn: (result) => {
      console.log(`— حالة الدور: ${result.status}${result.outcome.error ? ` (${result.outcome.error})` : ""}`);
    },
  });

  if (!config) {
    console.log("وضع محلي بلا مزامنة: اضبط MAYA_ACCESS_TOKEN وNEXT_PUBLIC_SUPABASE_URL وNEXT_PUBLIC_SUPABASE_ANON_KEY للمزامنة.");
  } else {
    const registered = await sync.registerDevice(toDbPlatform(platform), AGENT_VERSION);
    console.log(registered ? `تم تسجيل الجهاز: ${registered.name}` : "تعذر تسجيل الجهاز؛ المتابعة محليًا فقط.");
  }

  await agent.start();
  console.log("مايا تعمل. اضغط Enter للتحدث، و«مايا أوقف مايا» للخروج.");
  const { createInterface } = await import("node:readline/promises");
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  try {
    while (agent.isRunning()) {
      await readline.question("اضغط Enter للتحدث…");
      const result = await agent.handleTurn();
      if (result.stopRequested) {
        console.log("إلى اللقاء.");
        return 0;
      }
    }
  } catch (error) {
    console.error("توقف الوكيل:", error instanceof Error ? error.message : error);
    return 1;
  } finally {
    readline.close();
    await agent.shutdown();
  }
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith("cli.js")) {
  void runAgent();
}
