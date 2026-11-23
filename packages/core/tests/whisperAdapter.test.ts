import { describe, expect, it } from "vitest";

import { WhisperCliAdapter, cleanWhisperOutput } from "../src/whisperAdapter.js";

describe("cleanWhisperOutput", () => {
  it("strips timestamps and status lines", () => {
    const raw = [
      "whisper_model.py:223: UserWarning: FP16 is not supported on CPU",
      "Detected language: ARABIC (0.98)",
      "[00:00.000 --> 00:02.560]  مايا افتح كروم",
      "[00:02.560 --> 00:04.100]  من فضلك",
    ].join("\n");
    expect(cleanWhisperOutput(raw)).toBe("مايا افتح كروم من فضلك");
  });

  it("returns empty string for empty transcripts", () => {
    expect(cleanWhisperOutput("Detected language: ENGLISH (0.99)")).toBe("");
  });
});

describe("WhisperCliAdapter", () => {
  const fakeRunner = (stdout: string) => async () => ({ stdout, stderr: "" });

  it("passes the audio path as a single argument list (no shell string)", async () => {
    const captured: string[][] = [];
    const runner = async (file: string, args: string[]) => {
      captured.push([file, ...args]);
      return { stdout: "[00:00.000 --> 00:01.500]  مايا افتح كروم", stderr: "" };
    };
    const adapter = new WhisperCliAdapter({ binary: "whisper", model: "small", runner });
    const result = await adapter.transcribe({ audioPath: "/tmp/maya-utt-1.wav" });

    expect(result).toMatchObject({
      text: "مايا افتح كروم",
      language: "ar",
      engine: "whisper-cli:whisper:small",
    });
    // The only variable argument is our own temp file path; no shell wrapper.
    expect(captured[0]).toEqual([
      "whisper",
      "/tmp/maya-utt-1.wav",
      "--model", "small",
      "--task", "transcribe",
      "--output_format", "txt",
    ]);
  });

  it("honors a forced language hint", async () => {
    const captured: string[][] = [];
    const runner = async (_file: string, args: string[]) => {
      captured.push(args);
      return { stdout: "[00:00.000 --> 00:01.000]  hello", stderr: "" };
    };
    const adapter = new WhisperCliAdapter({ runner });
    const result = await adapter.transcribe({ audioPath: "/tmp/a.wav", languageHint: "ar" });
    expect(captured[0]).toContain("--language");
    expect(result.language).toBe("ar");
  });

  it("reports a clear message when the engine is not installed", async () => {
    const runner = async () => {
      const error = new Error("spawn whisper ENOENT") as Error & { code?: string };
      error.code = "ENOENT";
      throw error;
    };
    const adapter = new WhisperCliAdapter({ runner });
    await expect(adapter.transcribe({ audioPath: "/tmp/a.wav" })).rejects.toThrow("غير مثبت");
  });

  it("wraps engine failures with context", async () => {
    const runner = async () => {
      throw new Error("CUDA out of memory");
    };
    const adapter = new WhisperCliAdapter({ runner });
    await expect(adapter.transcribe({ audioPath: "/tmp/a.wav" })).rejects.toThrow("فشل التحويل الصوتي المحلي");
  });
});
