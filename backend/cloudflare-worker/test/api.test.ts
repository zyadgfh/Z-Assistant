import { beforeEach, describe, expect, it, vi } from "vitest";

import worker from "../src/index.js";
import type { Env } from "../src/env.d.js";

const BASE = "https://maya-worker.example";

function makeEnv(overrides: { [K in keyof Env]?: Env[K] | undefined } = {}): Env {
  return {
    ALLOWED_ORIGINS: "http://localhost:3000,https://app.example",
    DAILY_REQUEST_LIMIT: "200",
    GEMINI_API_KEY: "test-gemini-key",
    GEMINI_MODEL: "gemini-2.5-flash",
    ...overrides,
  };
}

function post(path: string, body: string, init: Record<string, string> = {}, ip = "203.0.113.1"): Request {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, Origin: "http://localhost:3000", ...init },
    body,
  });
}

const geminiJson = (payload: unknown) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(payload),
});

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /health", () => {
  it("reports liveness and AI configuration without leaking secrets", async () => {
    const response = await worker.fetch(new Request(`${BASE}/health`), makeEnv());
    const text = await response.text();
    const body = JSON.parse(text) as { ok: boolean; aiConfigured: boolean };
    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.aiConfigured).toBe(true);
    expect(text).not.toContain("test-gemini-key");
  });

  it("reports aiConfigured=false when the key is missing", async () => {
    const response = await worker.fetch(new Request(`${BASE}/health`), makeEnv({ GEMINI_API_KEY: undefined }));
    const body = (await response.json()) as { aiConfigured: boolean };
    expect(body.aiConfigured).toBe(false);
  });
});

describe("request validation", () => {
  it("rejects non-JSON content types", async () => {
    const response = await worker.fetch(
      new Request(`${BASE}/v1/assistant`, { method: "POST", headers: { "Content-Type": "text/plain", "CF-Connecting-IP": "198.51.100.9" }, body: "text=hi" }),
      makeEnv(),
    );
    expect(response.status).toBe(415);
  });

  it("rejects oversized bodies before parsing", async () => {
    const big = JSON.stringify({ text: "x".repeat(20 * 1024) });
    const response = await worker.fetch(post("/v1/assistant", big), makeEnv());
    expect(response.status).toBe(413);
  });

  it("rejects missing, empty, and too-long text", async () => {
    for (const body of [JSON.stringify({}), JSON.stringify({ text: "   " }), JSON.stringify({ text: "ا".repeat(501) })]) {
      const response = await worker.fetch(post("/v1/assistant", body), makeEnv({ DAILY_REQUEST_LIMIT: "1000" }));
      expect([400, 413]).toContain(response.status);
      const parsed = (await response.json()) as { error: { code: string } };
      expect(parsed.error.code).not.toBe("");
    }
  });

  it("rejects invalid JSON", async () => {
    const response = await worker.fetch(post("/v1/assistant", "{not-json"), makeEnv({ DAILY_REQUEST_LIMIT: "1000" }));
    expect(response.status).toBe(400);
  });
});

describe("deterministic intents via the API", () => {
  it("answers a safe Egyptian command with the structured contract", async () => {
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "افتحلي كروم", deviceId: "dev-1" })), makeEnv());
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      intent: "open_application",
      arguments: { application: "Google Chrome" },
      risk: "safe",
      requiresConfirmation: false,
      replyLanguage: "ar-EG",
    });
    expect(String(body.requestId)).toMatch(/[0-9a-f-]{36}/);
    expect(response.headers.get("X-RateLimit-Remaining")).toBeTruthy();
  });

  it("flags sensitive commands with requiresConfirmation=true", async () => {
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "اقفل التطبيق كروم" })), makeEnv());
    const body = (await response.json()) as { risk: string; requiresConfirmation: boolean };
    expect(body).toMatchObject({ risk: "sensitive", requiresConfirmation: true });
  });

  it("serves safe commands even without a Gemini key", async () => {
    const response = await worker.fetch(
      post("/v1/assistant", JSON.stringify({ text: "افتح مجلد التنزيلات" }), {}, "198.51.100.77"),
      makeEnv({ GEMINI_API_KEY: undefined }),
    );
    const body = (await response.json()) as { intent: string };
    expect(body.intent).toBe("open_folder");
  });
});

describe("Gemini path", () => {
  it("asks Gemini for unknown requests and validates the structured answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiJson({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          intent: "answer",
          arguments: {},
          replyText: "عاصمة اليابان طوكيو.",
          replyLanguage: "ar-EG",
        }) }] } }],
      })),
    );
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "ما عاصمة اليابان؟" })), makeEnv());
    const body = (await response.json()) as { intent: string | null; replyText: string; risk: string };
    expect(response.status).toBe(200);
    expect(body.intent).toBeNull();
    expect(body.replyText).toContain("طوكيو");
    expect(body.risk).toBe("safe");
  });

  it("never executes intents the model invented outside the whitelist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => geminiJson({
        candidates: [{ content: { parts: [{ text: JSON.stringify({
          intent: "shell_exec",
          arguments: { command: "rm -rf /" },
          replyText: "تم",
          replyLanguage: "ar-EG",
        }) }] } }],
      })),
    );
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "نظف الجهاز" })), makeEnv());
    const body = (await response.json()) as { intent: string | null };
    expect(body.intent).toBeNull();
  });

  it("returns a clear 502 on Gemini failure without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message: "boom" } }) })));
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "احكيلي نكتة" })), makeEnv());
    expect(response.status).toBe(502);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).not.toContain("test-gemini-key");
  });

  it("explains quota exhaustion (429) in Arabic", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 429, text: async () => JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED" } }) })));
    const response = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "احكيلي نكتة" }), {}, "198.51.100.5"), makeEnv());
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("نفدت حصة Gemini");
  });
});

describe("rate limiting and CORS", () => {
  it("enforces the daily ceiling per client IP with rate headers", async () => {
    const env = makeEnv({ DAILY_REQUEST_LIMIT: "2" });
    const ip = "198.51.100.42";
    const first = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "ارفع الصوت" }), {}, ip), env);
    const second = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "اخفض الصوت" }), {}, ip), env);
    const third = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "ارفع الصوت" }), {}, ip), env);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("echoes only allow-listed CORS origins", async () => {
    const good = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "ارفع الصوت" }), { Origin: "https://app.example" }, "198.51.100.90"), makeEnv({ DAILY_REQUEST_LIMIT: "500" }));
    expect(good.headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");

    const bad = await worker.fetch(post("/v1/assistant", JSON.stringify({ text: "ارفع الصوت" }), { Origin: "https://evil.example" }, "198.51.100.91"), makeEnv({ DAILY_REQUEST_LIMIT: "500" }));
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers CORS preflight without consuming the rate limit", async () => {
    const preflight = new Request(`${BASE}/v1/assistant`, { method: "OPTIONS", headers: { Origin: "https://app.example" } });
    const response = await worker.fetch(preflight, makeEnv());
    expect(response.status).toBe(204);
  });
});

describe("other routes", () => {
  it("returns a clear 501 for /v1/transcribe in v1", async () => {
    const response = await worker.fetch(post("/v1/transcribe", "{}", {}, "198.51.100.11"), makeEnv());
    expect(response.status).toBe(501);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toContain("التعرف المحلي");
  });

  it("404s unknown paths", async () => {
    const response = await worker.fetch(new Request(`${BASE}/nope`), makeEnv());
    expect(response.status).toBe(404);
  });
});
