/**
 * Maya voice pipeline (plan sections 4.2 and 10).
 *
 * Chains the mandated separation end-to-end:
 *   wake word -> speech-to-text -> language -> intent -> permissions -> tool
 *
 * The pipeline never touches the operating system itself. It returns declarative
 * `DeviceAction`s that the platform client (macOS script, Windows app, Android
 * service) executes — `platform.openApplication` in the plan's own example — so
 * the same auditable core drives every device.
 */

import { decide } from "./permissionEngine";
import { parseCommand } from "./commandRouter";
import { extractAfterWakeWord } from "./speech";
import type { AudioUtterance } from "./speech";
import type { Intent, PermissionDecision, ProviderRequest } from "./types";
import type { OmniRouteGateway } from "./providerRouter";

export type DeviceAction =
  | { kind: "open_url"; url: string; label: string }
  | { kind: "open_application"; app: string }
  | { kind: "open_folder"; folder: string }
  | { kind: "take_screenshot" }
  | { kind: "play_song"; song: string }
  | { kind: "stop" }
  | { kind: "speak"; text: string };

export type CommandOutcomeStatus =
  | "executed"
  | "rejected"
  | "failed"
  | "awaiting_confirmation";

/** One row per handled utterance — the device client persists it to Supabase. */
export interface VoiceCommandRecord {
  intent: string;
  risk: Intent["risk"];
  status: CommandOutcomeStatus;
  latencyMs: number;
  channel: "voice";
  error?: string | undefined;
  /** Present only when the user consented to storing transcripts. */
  transcript?: string | undefined;
}

export interface VoiceCommandSink {
  record(entry: VoiceCommandRecord): void | Promise<void>;
}

export type PipelineStage =
  | "ignored"
  | "no_command"
  | "executed"
  | "answered"
  | "needs_confirmation"
  | "needs_auth"
  | "rejected"
  | "failed";

export interface PipelineOutcome {
  stage: PipelineStage;
  intent?: Intent | undefined;
  decision?: PermissionDecision | undefined;
  actions?: DeviceAction[] | undefined;
  reply?: string | undefined;
  error?: string | undefined;
}

export function buildGoogleSearchUrl(query: string): string {
  const params = new URLSearchParams({ q: query }).toString();
  return `https://www.google.com/search?${params.replace(/\+/g, "%20")}`;
}

export function buildYoutubeSearchUrl(query: string): string {
  const params = new URLSearchParams({ search_query: query }).toString();
  return `https://www.youtube.com/results?${params.replace(/\+/g, "%20")}`;
}

/** Map an approved intent to declarative device actions. */
export function planActions(intent: Intent): DeviceAction[] {
  switch (intent.name) {
    case "search_google":
      return [{ kind: "open_url", url: buildGoogleSearchUrl(intent.args.query ?? ""), label: "بحث جوجل" }];
    case "search_youtube":
      return [{ kind: "open_url", url: buildYoutubeSearchUrl(intent.args.query ?? ""), label: "بحث يوتيوب" }];
    case "play_song":
      return [{ kind: "play_song", song: intent.args.song ?? "" }];
    case "open_application":
      return [{ kind: "open_application", app: intent.args.app ?? "" }];
    case "open_folder":
      return [{ kind: "open_folder", folder: intent.args.folder ?? "" }];
    case "take_screenshot":
      return [{ kind: "take_screenshot" }];
    case "introduce":
      return [
        {
          kind: "speak",
          text:
            intent.locale === "en"
              ? "Hello! I am Maya, your bilingual voice assistant."
              : "مرحباً! أنا مايا، مساعدتك الصوتية ثنائية اللغة.",
        },
      ];
    case "stop":
      return [{ kind: "stop" }];
    default:
      return [];
  }
}

export interface MayaPipelineDeps {
  stt: import("./speech").SpeechToText;
  gateway: OmniRouteGateway;
  sink?: VoiceCommandSink | undefined;
}

export class MayaPipeline {
  private readonly sink: VoiceCommandSink | undefined;

  constructor(private readonly deps: MayaPipelineDeps) {
    this.sink = deps.sink;
  }

  private async safeRecord(entry: VoiceCommandRecord): Promise<void> {
    if (!this.sink) return;
    try {
      await this.sink.record(entry);
    } catch {
      // Telemetry must never break the command path (plan section 13).
    }
  }

  async handleUtterance(utterance: AudioUtterance): Promise<PipelineOutcome> {
    const started = Date.now();
    let transcriptionText = "";

    try {
      const transcription = await this.deps.stt.transcribe(utterance);
      transcriptionText = transcription.text;

      const afterWake = extractAfterWakeWord(transcriptionText);
      if (afterWake === null) {
        // Ambient speech without the wake word: never analyzed further.
        return { stage: "ignored" };
      }
      if (!afterWake) {
        return { stage: "no_command" };
      }

      const intent = parseCommand(afterWake);
      const decision = decide(intent);
      const latencyMs = Date.now() - started;

      if (decision.action === "reject") {
        await this.safeRecord({
          intent: intent.name, risk: intent.risk, status: "rejected",
          latencyMs, channel: "voice", error: decision.reason,
        });
        return { stage: "rejected", intent, decision, error: decision.reason };
      }

      if (decision.action !== "execute") {
        await this.safeRecord({
          intent: intent.name, risk: intent.risk, status: "awaiting_confirmation",
          latencyMs, channel: "voice",
        });
        return {
          stage: decision.action === "confirm" ? "needs_confirmation" : "needs_auth",
          intent,
          decision,
        };
      }

      if (intent.name === "ai_query") {
        const request: ProviderRequest = {
          prompt: intent.args.prompt ?? "",
          sensitivity: "safe",
          // The product is Arabic-first; mixed utterances are answered in Arabic.
          locale: intent.locale === "en" ? "en" : "ar",
        };
        const reply = await this.deps.gateway.route(request);
        await this.safeRecord({
          intent: intent.name, risk: intent.risk, status: "executed",
          latencyMs: Date.now() - started, channel: "voice",
        });
        return { stage: "answered", intent, decision, reply: reply.text };
      }

      const actions = planActions(intent);
      await this.safeRecord({
        intent: intent.name, risk: intent.risk, status: "executed",
        latencyMs: Date.now() - started, channel: "voice",
      });
      return { stage: "executed", intent, decision, actions };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.safeRecord({
        intent: "unknown", risk: "safe", status: "failed",
        latencyMs: Date.now() - started, channel: "voice", error: message,
      });
      return { stage: "failed", error: message };
    }
  }
}
