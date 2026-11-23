/**
 * Whisper CLI adapter for local speech-to-text (plan sections 4.2/4.3).
 *
 * Safety invariant: spoken text is never an INPUT to a shell. The adapter
 * spawns a local binary with an argument list (`shell: false`) whose only
 * variable argument is an audio file path created by our own recorder — the
 * transcript flows OUT of the engine, never into a command.
 *
 * Supports `whisper` (openai-whisper) and `faster-whisper` CLIs, which share
 * the `[00:00.000 --> 00:02.560] text` output shape. Works fully offline once
 * the model is on the device; model size maps to plan section 4.3 tiers
 * (tiny/base → weak devices, small → ordinary, medium/large → powerful).
 */

import { detectSpokenLanguage } from "./speech.js";
import type { AudioUtterance, SpeechToText, TranscriptionResult } from "./speech.js";

export type CliRunner = (
  file: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

export function defaultCliRunner(timeoutMs = 120_000): CliRunner {
  // Lazily imported so tests and browsers never need node:child_process.
  return async (file, args) => {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const run = promisify(execFile);
    return run(file, args, {
      timeout: timeoutMs,
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
    });
  };
}

/** Strip whisper timestamps/status lines and join the transcript. */
export function cleanWhisperOutput(stdout: string): string {
  const lines = stdout.split("\n");
  // Real transcripts carry [timestamp] prefixes; when present, keep only those
  // lines so warnings and progress noise never leak into the transcript.
  const timed = lines
    .filter((line) => /^\s*\[/.test(line))
    .map((line) => line.replace(/^\s*\[[^\]]*\]\s*/, "").trim());
  const source = timed.length > 0 ? timed : lines;
  return source
    .filter((line) => line.trim().length > 0)
    .filter((line) => !/Detected language|Probability|Warning|whisper_model|^warn/i.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message.split("\n")[0]?.trim() || error.message;
  }
  return String(error);
}

function isMissingBinary(error: unknown): boolean {
  const code = (error as { code?: string })?.code;
  return code === "ENOENT" || describeError(error).includes("ENOENT");
}

export interface WhisperAdapterOptions {
  binary?: "whisper" | "faster-whisper" | (string & {});
  model?: "tiny" | "base" | "small" | "medium" | "large-v3" | (string & {});
  runner?: CliRunner;
}

export class WhisperCliAdapter implements SpeechToText {
  readonly name: string;
  private readonly binary: string;
  private readonly model: string;
  private readonly runner: CliRunner;

  constructor(options: WhisperAdapterOptions = {}) {
    this.binary = options.binary ?? "whisper";
    this.model = options.model ?? "small";
    this.runner = options.runner ?? defaultCliRunner();
    this.name = `whisper-cli:${this.binary}:${this.model}`;
  }

  async transcribe(utterance: AudioUtterance): Promise<TranscriptionResult> {
    const args = [
      utterance.audioPath,
      "--model",
      this.model,
      "--task",
      "transcribe",
      "--output_format",
      "txt",
    ];
    if (utterance.languageHint === "ar" || utterance.languageHint === "en") {
      args.push("--language", utterance.languageHint);
    }

    try {
      const { stdout } = await this.runner(this.binary, args);
      const text = cleanWhisperOutput(stdout);
      return {
        text,
        language: utterance.languageHint && utterance.languageHint !== "unknown"
          ? utterance.languageHint
          : detectSpokenLanguage(text),
        engine: this.name,
      };
    } catch (error) {
      if (isMissingBinary(error)) {
        throw new Error(
          `المحرك المحلي «${this.binary}» غير مثبت على هذا الجهاز. ثبّت faster-whisper أو openai-whisper (stt/requirements.txt).`,
        );
      }
      throw new Error(`فشل التحويل الصوتي المحلي: ${describeError(error)}`);
    }
  }
}
