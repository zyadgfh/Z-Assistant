import { describe, expect, it } from "vitest";

import { ActionsExecutor } from "../src/actions.js";
import { buildRecordingCommand } from "../src/recorder.js";

describe("ActionsExecutor", () => {
  const executed: string[] = [];
  const fakeRunner = async (file: string, args: string[]) => {
    executed.push(`${file} ${args.join(" ")}`);
    return { stdout: "", stderr: "" };
  };

  it("runs the mapped command for an action", async () => {
    const executor = new ActionsExecutor({ platform: "macos", runner: fakeRunner });
    const result = await executor.execute({ kind: "open_application", app: "Google Chrome" });
    expect(result.ok).toBe(true);
    expect(executed[executed.length - 1]).toBe("open -a Google Chrome");
  });

  it("reports failures without throwing", async () => {
    const failing = async () => {
      throw new Error("spawn failed");
    };
    const executor = new ActionsExecutor({ platform: "macos", runner: failing });
    const result = await executor.execute({ kind: "open_url", url: "https://x", label: "x" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("spawn failed");
  });

  it("marks unsupported platform actions instead of crashing", async () => {
    const executor = new ActionsExecutor({ platform: "unknown", runner: fakeRunner });
    const result = await executor.execute({ kind: "take_screenshot" });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("غير مدعوم");
  });

  it("executes a list in order and returns every result", async () => {
    const executor = new ActionsExecutor({ platform: "macos", runner: fakeRunner });
    const results = await executor.executeAll([
      { kind: "speak", text: "مرحبا" },
      { kind: "open_url", url: "https://youtube.com", label: "يوتيوب" },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]?.ok).toBe(true);
    expect(executed[executed.length - 1]).toBe("open https://youtube.com");
  });

  it("invokes the audit hook for every attempt", async () => {
    const seen: string[] = [];
    const executor = new ActionsExecutor({
      platform: "macos",
      runner: fakeRunner,
      onAction: (entry) => seen.push(entry.kind),
    });
    await executor.executeAll([{ kind: "speak", text: "hi" }, { kind: "stop" }]);
    expect(seen).toEqual(["speak", "stop"]);
  });
});

describe("buildRecordingCommand", () => {
  it("uses sox rec on macOS by default and caps duration", () => {
    const spec = buildRecordingCommand("/tmp/u.wav", 20, "macos");
    expect(spec.file).toBe("rec");
    expect(spec.args).toContain("/tmp/u.wav");
    expect(spec.args.at(-1)).toBe("15");
    expect(buildRecordingCommand("/tmp/u.wav", 0, "macos").args.at(-1)).toBe("1");
  });

  it("uses ffmpeg dshow on Windows with the device name", () => {
    const spec = buildRecordingCommand("C:/u.wav", 5, "windows", "Microphone Array");
    expect(spec.file).toBe("ffmpeg");
    expect(spec.args).toContain("audio=Microphone Array");
    expect(spec.args).toEqual(expect.arrayContaining(["-t", "5"]));
    expect(spec.args.at(-1)).toBe("C:/u.wav");
  });

  it("uses arecord on Linux", () => {
    const spec = buildRecordingCommand("/tmp/u.wav", 6, "linux");
    expect(spec.file).toBe("arecord");
    expect(spec.args).toContain("-d");
  });
});
