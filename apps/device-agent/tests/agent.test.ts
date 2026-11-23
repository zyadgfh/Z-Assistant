import { describe, expect, it } from "vitest";

import { MayaAgent } from "../src/agent.js";
import type { ExecutedAction } from "../src/actions.js";
import type { PipelineOutcome } from "@maya/core";

function fakeRecorder(cleanupCalls: string[]) {
  return {
    record: async () => "/tmp/maya-utt-test.wav",
    cleanup: async (path: string) => {
      cleanupCalls.push(path);
    },
  };
}

function makeAgent(outcome: PipelineOutcome, executed: ExecutedAction[] = []) {
  const executedLog: string[] = [];
  const agent = new MayaAgent({
    pipeline: { handleUtterance: async () => outcome } as Pick<
      import("@maya/core").MayaPipeline,
      "handleUtterance"
    >,
    stt: { name: "fake", transcribe: async () => ({ text: "مايا افتح كروم", language: "ar", engine: "fake" }) },
    recorder: fakeRecorder(cleanupLog),
    executor: {
      executeAll: async (actions) => {
        for (const a of actions) executedLog.push(a.kind);
        return executed.length ? executed : actions.map((a) => ({ kind: a.kind, describe: "", ok: true }));
      },
    },
    captureSeconds: 8,
  });
  return { agent, executedLog };
}

const cleanupLog: string[] = [];

describe("MayaAgent", () => {
  it("executes safe actions and cleans up the audio file", async () => {
    cleanupLog.length = 0;
    const { agent } = makeAgent({
      stage: "executed",
      intent: { name: "open_application", args: { app: "Google Chrome" }, risk: "safe", raw: "", locale: "ar" },
      actions: [{ kind: "open_application", app: "Google Chrome" }],
    });
    await agent.start();
    const result = await agent.handleTurn();

    expect(result.status).toBe("executed");
    expect(result.stopRequested).toBe(false);
    expect(cleanupLog).toEqual(["/tmp/maya-utt-test.wav"]);
    await agent.shutdown();
  });

  it("speaks answers through the platform TTS action", async () => {
    const { agent, executedLog } = makeAgent({ stage: "answered", reply: "مرحبًا بك" });
    await agent.start();
    const result = await agent.handleTurn();
    expect(result.status).toBe("answered");
    expect(executedLog).toEqual(["speak"]);
  });

  it("stops the loop when the stop action runs", async () => {
    const { agent } = makeAgent({
      stage: "executed",
      intent: { name: "stop", args: {}, risk: "safe", raw: "", locale: "ar" },
      actions: [{ kind: "stop" }],
    });
    await agent.start();
    const result = await agent.handleTurn();
    expect(result.status).toBe("stopped");
    expect(result.stopRequested).toBe(true);
    expect(agent.isRunning()).toBe(false);
    const afterStop = await agent.handleTurn();
    expect(afterStop.status).toBe("stopped");
  });

  it("keeps failures non-fatal and still deletes audio", async () => {
    cleanupLog.length = 0;
    const agent = new MayaAgent({
      pipeline: { handleUtterance: async () => { throw new Error("المحرك المحلي «whisper» غير مثبت على هذا الجهاز."); } } as Pick<
        import("@maya/core").MayaPipeline,
        "handleUtterance"
      >,
      stt: { name: "fake", transcribe: async () => ({ text: "", language: "unknown", engine: "fake" }) },
      recorder: fakeRecorder(cleanupLog),
      executor: { executeAll: async () => [] },
    });
    await agent.start();
    const result = await agent.handleTurn();
    expect(result.status).toBe("failed");
    expect(result.outcome.error).toContain("غير مثبت");
    expect(cleanupLog).toHaveLength(1);
    expect(agent.isRunning()).toBe(true);
  });
});

describe("supabaseSync mapping", () => {
  it("maps platforms to db enums", async () => {
    const { toDbPlatform } = await import("../src/supabaseSync.js");
    expect(toDbPlatform("macos")).toBe("macos");
    expect(toDbPlatform("windows")).toBe("windows");
    expect(toDbPlatform("linux")).toBe("web");
    expect(toDbPlatform("other")).toBe("web");
  });
});
