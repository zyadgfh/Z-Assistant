/**
 * Microphone recording for the device agent.
 *
 * The recording command is built per platform with an argv list only; the
 * utterance goes to a temp file that the caller deletes right after
 * transcription (plan section 5.4 — raw audio retention policy).
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Platform } from "./platform.js";
import type { ProcessRunner } from "./actions.js";

export interface RecordingSpec {
  file: string;
  args: string[];
}

/** Pure command builder for a fixed-duration recording to `path`. */
export function buildRecordingCommand(path: string, seconds: number, platform: Platform, audioDevice?: string): RecordingSpec {
  const capped = Math.min(Math.max(seconds, 1), 15);
  switch (platform) {
    case "macos":
      // sox ships as `rec` on macOS (brew install sox); AV foundation input via ffmpeg as fallback.
      return audioDevice
        ? { file: "ffmpeg", args: ["-y", "-f", "avfoundation", "-i", `:${audioDevice}`, "-t", String(capped), path] }
        : { file: "rec", args: ["-q", "-r", "16000", "-c", "1", "-b", "16", path, "trim", "0", String(capped)] };
    case "windows":
      return {
        file: "ffmpeg",
        args: ["-y", "-f", "dshow", "-i", `audio=${audioDevice ?? "Microphone"}`, "-t", String(capped), path],
      };
    case "linux":
      return audioDevice
        ? { file: "arecord", args: ["-q", "-d", String(capped), "-r", "16000", "-c", "1", "-f", "S16_LE", audioDevice, path] }
        : { file: "arecord", args: ["-q", "-d", String(capped), "-r", "16000", "-c", "1", "-f", "S16_LE", path] };
    default:
      throw new Error(`التسجيل الميكروفوني غير مدعوم على ${platform}.`);
  }
}

export interface RecorderOptions {
  platform: Platform;
  runner?: ProcessRunner;
  audioDevice?: string | undefined;
}

export class CliRecorder {
  private readonly runner: ProcessRunner;
  private currentDir: string | null = null;

  constructor(private readonly options: RecorderOptions) {
    this.runner = options.runner ?? (async () => ({ stdout: "", stderr: "" }));
  }

  /** Record one utterance and return the temp file path. */
  async record(seconds: number): Promise<string> {
    if (!this.currentDir) {
      this.currentDir = await mkdtemp(join(tmpdir(), "maya-utterance-"));
    }
    const path = join(this.currentDir, `utt_${Date.now()}.wav`);
    const spec = buildRecordingCommand(path, seconds, this.options.platform, this.options.audioDevice);
    await this.runner(spec.file, spec.args);
    return path;
  }

  /** Delete the utterance file (plan 5.4) — best effort, never throws. */
  async cleanup(path: string): Promise<void> {
    try {
      const { unlink } = await import("node:fs/promises");
      await unlink(path);
    } catch {
      // A leftover temp file is preferable to crashing the listen loop.
    }
  }
}
