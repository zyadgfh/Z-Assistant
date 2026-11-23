import { describe, expect, it } from "vitest";

import { MayaPipeline, buildGoogleSearchUrl, buildYoutubeSearchUrl } from "../src/pipeline.js";
import type { DeviceAction, VoiceCommandRecord, VoiceCommandSink } from "../src/pipeline.js";
import { OmniRouteGateway } from "../src/providerRouter.js";
import { LocalModelAdapter } from "../src/providerRouter.js";
import type { AudioUtterance, SpeechToText, TranscriptionResult } from "../src/speech.js";

function fakeStt(text: string): SpeechToText {
  return {
    name: "fake-stt",
    transcribe: async (utterance: AudioUtterance): Promise<TranscriptionResult> => ({
      text,
      language: "ar",
      engine: "fake-stt",
      ...utterance,
    }),
  };
}

class CollectingSink implements VoiceCommandSink {
  readonly entries: VoiceCommandRecord[] = [];
  record(entry: VoiceCommandRecord): void {
    this.entries.push(entry);
  }
}

const answeringGateway = new OmniRouteGateway({
  adapters: [new LocalModelAdapter()],
});

const utterance: AudioUtterance = { audioPath: "/tmp/maya-utt.wav" };

describe("buildSearchUrls", () => {
  it("encodes queries safely", () => {
    expect(buildGoogleSearchUrl("C++ & Python")).toBe(
      "https://www.google.com/search?q=C%2B%2B%20%26%20Python",
    );
    expect(buildYoutubeSearchUrl("أخبار التقنية")).toContain("search_query=");
  });
});

describe("MayaPipeline", () => {
  it("ignores ambient speech without the wake word", async () => {
    const pipeline = new MayaPipeline({ stt: fakeStt("طقس اليوم جميل"), gateway: answeringGateway });
    const outcome = await pipeline.handleUtterance(utterance);
    expect(outcome.stage).toBe("ignored");
  });

  it("reports activation with no command when only the wake word is spoken", async () => {
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا"), gateway: answeringGateway });
    expect((await pipeline.handleUtterance(utterance)).stage).toBe("no_command");
  });

  it("executes a safe command and returns declarative device actions", async () => {
    const sink = new CollectingSink();
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا افتح كروم"), gateway: answeringGateway, sink });
    const outcome = await pipeline.handleUtterance(utterance);

    expect(outcome.stage).toBe("executed");
    expect(outcome.intent?.name).toBe("open_application");
    expect(outcome.actions).toEqual([{ kind: "open_application", app: "Google Chrome" }]);
    expect(sink.entries[0]).toMatchObject({ intent: "open_application", status: "executed", channel: "voice" });
  });

  it("returns a URL action with encoded query for searches", async () => {
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا ابحث في جوجل عن C++ & Python"), gateway: answeringGateway });
    const outcome = await pipeline.handleUtterance(utterance);
    expect(outcome.stage).toBe("executed");
    expect(outcome.actions?.[0]).toMatchObject({
      kind: "open_url",
      url: buildGoogleSearchUrl("c++ & python"),
    });
  });

  it("answers unknown questions through OmniRoute as text only", async () => {
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا ما عاصمة اليابان"), gateway: answeringGateway });
    const outcome = await pipeline.handleUtterance(utterance);
    expect(outcome.stage).toBe("answered");
    expect(outcome.reply).toBeTruthy();
    expect(outcome.decision?.action).toBe("execute");
  });

  it("routes destructive requests to the authentication tier, not execution", async () => {
    const sink = new CollectingSink();
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا احذف الملف القديم"), gateway: answeringGateway, sink });
    const outcome = await pipeline.handleUtterance(utterance);

    expect(outcome.stage).toBe("needs_auth");
    expect(outcome.intent?.name).toBe("delete_file");
    expect(outcome.decision?.requirement).toBe("voiceprint_plus_pin");
    expect(sink.entries[0]?.status).toBe("awaiting_confirmation");
  });

  it("fails with a clear message when the STT engine is broken", async () => {
    const brokenStt: SpeechToText = {
      name: "broken",
      transcribe: async () => {
        throw new Error("المحرك المحلي «whisper» غير مثبت على هذا الجهاز.");
      },
    };
    const pipeline = new MayaPipeline({ stt: brokenStt, gateway: answeringGateway });
    const outcome = await pipeline.handleUtterance(utterance);
    expect(outcome.stage).toBe("failed");
    expect(outcome.error).toContain("غير مثبت");
  });

  it("survives a failing telemetry sink", async () => {
    const failingSink: VoiceCommandSink = {
      record: () => {
        throw new Error("network down");
      },
    };
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا افتح كروم"), gateway: answeringGateway, sink: failingSink });
    const outcome = await pipeline.handleUtterance(utterance);
    expect(outcome.stage).toBe("executed");
  });

  it("exposes a speak action for the introduction intent", async () => {
    const pipeline = new MayaPipeline({ stt: fakeStt("مايا عرفي نفسك"), gateway: answeringGateway });
    const outcome = await pipeline.handleUtterance(utterance);
    const actions = outcome.actions as DeviceAction[];
    expect(actions[0]?.kind).toBe("speak");
  });
});
