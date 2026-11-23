/**
 * The Maya device agent orchestrator (plan section 11 stage 1).
 *
 * One turn = push-to-talk capture -> local Whisper transcription -> Maya
 * pipeline (wake word -> intent -> permissions) -> declarative actions on the
 * OS -> Supabase logging. The loop stops cleanly on a `stop` action or
 * Ctrl+C; audio files are deleted right after transcription (plan 5.4).
 */

import type { MayaPipeline, PipelineOutcome, DeviceAction } from "@maya/core";
import type { SpeechToText, AudioUtterance } from "@maya/core";

import type { ActionsExecutor, ExecutedAction } from "./actions.js";
import type { CliRecorder } from "./recorder.js";

export type AgentTurnStatus = "ignored" | "no_command" | "executed" | "answered" | "needs_auth" | "rejected" | "failed" | "stopped";

export interface AgentTurnResult {
  status: AgentTurnStatus;
  outcome: PipelineOutcome;
  actions: ExecutedAction[];
  stopRequested: boolean;
}

export interface MayaAgentOptions {
  pipeline: Pick<MayaPipeline, "handleUtterance">;
  stt: SpeechToText;
  recorder: Pick<CliRecorder, "record" | "cleanup">;
  executor: Pick<ActionsExecutor, "executeAll">;
  /** Seconds of audio per utterance (plan: short commands). */
  captureSeconds?: number;
  /** Receives one line per turn for the console UI. */
  onTurn?: ((result: AgentTurnResult) => void) | undefined;
}

export class MayaAgent {
  private running = false;
  private readonly captureSeconds: number;

  constructor(private readonly options: MayaAgentOptions) {
    this.captureSeconds = options.captureSeconds ?? 8;
  }

  isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async shutdown(): Promise<void> {
    this.running = false;
  }

  /**
   * Capture, transcribe, and handle one utterance. Never throws: failures
   * become `failed` turns so the listen loop keeps running (plan section 7).
   */
  async handleTurn(): Promise<AgentTurnResult> {
    if (!this.running) {
      return { status: "stopped", outcome: { stage: "ignored" }, actions: [], stopRequested: true };
    }

    let audioPath: string | null = null;
    try {
      audioPath = await this.options.recorder.record(this.captureSeconds);
      const utterance: AudioUtterance = { audioPath, languageHint: undefined };
      const outcome = await this.options.pipeline.handleUtterance(utterance);
      const actions = await this.executeOutcome(outcome);
      const stopRequested = actions.some((a) => a.kind === "stop" && a.ok);

      const status = this.mapStatus(outcome, stopRequested);
      const result: AgentTurnResult = { status, outcome, actions, stopRequested };
      this.options.onTurn?.(result);
      if (stopRequested) await this.shutdown();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const result: AgentTurnResult = {
        status: "failed",
        outcome: { stage: "failed", error: message },
        actions: [],
        stopRequested: false,
      };
      this.options.onTurn?.(result);
      return result;
    } finally {
      if (audioPath) await this.options.recorder.cleanup(audioPath);
    }
  }

  private async executeOutcome(outcome: PipelineOutcome): Promise<ExecutedAction[]> {
    const actions: DeviceAction[] = outcome.actions ?? [];
    if (outcome.stage === "answered" && outcome.reply) {
      // Spoken answers are an action like any other; the platform TTS speaks it.
      return this.options.executor.executeAll([{ kind: "speak", text: outcome.reply }]);
    }
    return this.options.executor.executeAll(actions);
  }

  private mapStatus(outcome: PipelineOutcome, stopRequested: boolean): AgentTurnStatus {
    if (stopRequested) return "stopped";
    switch (outcome.stage) {
      case "ignored":
        return "ignored";
      case "no_command":
        return "no_command";
      case "executed":
        return "executed";
      case "answered":
        return "answered";
      case "needs_confirmation":
      case "needs_auth":
        return "needs_auth";
      case "rejected":
        return "rejected";
      default:
        return "failed";
    }
  }
}
