import { describe, expect, it } from "vitest";

import { GeminiClient, MAYA_GUARD_SYSTEM_PROMPT, classifyGeminiFailure, extractGeminiText } from "../src/geminiClient";
import { LocalModelAdapter, OmniRouteGateway, QuotaTracker } from "../src/providerRouter";
import type { GeminiHttpResponse } from "../src/geminiClient";

function httpResponse(status: number, body: unknown): GeminiHttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

function okResponse(text: string): GeminiHttpResponse {
  return httpResponse(200, {
    candidates: [
      { content: { parts: [{ text }] }, finishReason: "STOP" },
    ],
    usageMetadata: { totalTokenCount: 12 },
  });
}

type CapturedRequest = { url: string; headers: Record<string, string>; body: string };

function captureFetch(responses: GeminiHttpResponse[] | ((attempt: CapturedRequest) => GeminiHttpResponse)) {
  const captured: CapturedRequest[] = [];
  const fetchImpl = async (url: string, init: { headers: Record<string, string>; body: string }) => {
    const request = { url, headers: init.headers, body: init.body };
    captured.push(request);
    return typeof responses === "function" ? responses(request) : (captured.length <= responses.length ? responses[captured.length - 1]! : responses[responses.length - 1]!);
  };
  return { captured, fetchImpl };
}

describe("GeminiClient", () => {
  const request = { prompt: "ما عاصمة اليابان؟", sensitivity: "safe" as const, locale: "ar" as const };

  it("posts to the v1beta generateContent endpoint with the key header", async () => {
    const { captured, fetchImpl } = captureFetch([okResponse("طوكيو")]);
    const client = new GeminiClient({ apiKey: "test-key", model: "gemini-2.5-flash", fetchImpl });
    const reply = await client.complete(request);

    expect(reply).toMatchObject({ text: "طوكيو", provider: "gemini" });
    expect(captured[0]?.url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    expect(captured[0]?.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(captured[0]?.body ?? "{}") as {
      contents: Array<{ parts: Array<{ text: string }> }>;
      systemInstruction: { parts: Array<{ text: string }> };
    };
    expect(body.contents[0]?.parts[0]?.text).toBe("ما عاصمة اليابان؟");
    expect(body.systemInstruction.parts[0]?.text).toBe(MAYA_GUARD_SYSTEM_PROMPT);
  });

  it("honors a caller-provided system prompt", async () => {
    const { captured, fetchImpl } = captureFetch([okResponse("ok")]);
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await client.complete({ ...request, system: "custom prompt" });
    const body = JSON.parse(captured[0]?.body ?? "{}") as { systemInstruction: { parts: Array<{ text: string }> } };
    expect(body.systemInstruction.parts[0]?.text).toBe("custom prompt");
  });

  it("turns 429 into a quota failure message", async () => {
    const { fetchImpl } = captureFetch([
      httpResponse(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "exhausted" } }),
    ]);
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(client.complete(request)).rejects.toThrow("نفدت حصة Gemini");
  });

  it("recognizes an invalid API key", async () => {
    const { fetchImpl } = captureFetch([
      httpResponse(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key." } }),
    ]);
    const client = new GeminiClient({ apiKey: "bad", fetchImpl });
    await expect(client.complete(request)).rejects.toThrow("مفتاح Gemini غير صالح");
  });

  it("surfaces safety blocks from promptFeedback", async () => {
    const { fetchImpl } = captureFetch([
      httpResponse(200, { promptFeedback: { blockReason: "SAFETY" } }),
    ]);
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(client.complete(request)).rejects.toThrow("حجب أمان Gemini");
  });

  it("explains empty candidates", async () => {
    const { fetchImpl } = captureFetch([httpResponse(200, { candidates: [] })]);
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(client.complete(request)).rejects.toThrow("لم يُرجع Gemini نصًا");
  });

  it("treats network failures (TypeError) as connectivity errors", async () => {
    const fetchImpl = async () => {
      throw new TypeError("fetch failed");
    };
    const client = new GeminiClient({ apiKey: "k", fetchImpl });
    await expect(client.complete(request)).rejects.toThrow("تعذر الوصول إلى Gemini");
  });

  it("is unavailable without a key and explains what to do", async () => {
    const client = new GeminiClient({ apiKey: undefined, fetchImpl: async () => okResponse("x") });
    await expect(client.isAvailable()).resolves.toBe(false);
    await expect(client.complete(request)).rejects.toThrow("GEMINI_API_KEY");
  });
});

describe("Gemini inside OmniRouteGateway", () => {
  const request = { prompt: "hello", sensitivity: "safe" as const, locale: "en" as const };

  it("falls back to the local model when Gemini is rate-limited", async () => {
    const { fetchImpl } = captureFetch([
      httpResponse(429, { error: { code: 429, status: "RESOURCE_EXHAUSTED" } }),
    ]);
    const gateway = new OmniRouteGateway({
      adapters: [new GeminiClient({ apiKey: "k", fetchImpl }), new LocalModelAdapter()],
    });
    const reply = await gateway.route(request);
    expect(reply.provider).toBe("local-ollama");
  });

  it("skips Gemini entirely once the local quota ceiling is spent", async () => {
    const brokenLocal = new LocalModelAdapter();
    brokenLocal.isAvailable = async () => false;
    const { fetchImpl } = captureFetch([okResponse("cloud")]);
    const gateway = new OmniRouteGateway({
      adapters: [
        new GeminiClient({ apiKey: "k", fetchImpl, quota: new QuotaTracker({ gemini: 1 }) }),
        brokenLocal,
      ],
    });
    expect((await gateway.route(request)).provider).toBe("gemini");
    // Ceiling consumed; the next call must not hit the network and fails closed.
    await expect(gateway.route(request)).rejects.toThrow("no provider allowed");
  });

  it("skips Gemini when no key is configured and stays local", async () => {
    const { fetchImpl } = captureFetch([okResponse("cloud")]);
    const gateway = new OmniRouteGateway({
      adapters: [new GeminiClient({ apiKey: undefined, fetchImpl }), new LocalModelAdapter()],
    });
    expect((await gateway.route(request)).provider).toBe("local-ollama");
  });
});

describe("wire helpers", () => {
  it("classifyGeminiFailure keeps provider messages for unknown codes", () => {
    expect(classifyGeminiFailure(500, { error: { message: "backend down" } })).toContain("backend down");
    expect(classifyGeminiFailure(503, {})).toContain("503");
  });

  it("extractGeminiText joins multi-part answers", () => {
    const text = extractGeminiText({
      candidates: [{ content: { parts: [{ text: "أهلاً " }, { text: "بك" }] } }],
    });
    expect(text).toBe("أهلاً بك");
  });
});
