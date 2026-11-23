import { describe, expect, it } from "vitest";

import { GeminiAdapter, LocalModelAdapter, OmniRouteGateway, QuotaTracker } from "../src/providerRouter";
import type { ProviderRequest } from "../src/types";

const safeRequest: ProviderRequest = { prompt: "hello", sensitivity: "safe", locale: "en" };
const sensitiveRequest: ProviderRequest = { prompt: "private note", sensitivity: "sensitive", locale: "ar" };

describe("OmniRouteGateway", () => {
  it("prefers the local model first", async () => {
    const gateway = new OmniRouteGateway({
      adapters: [new GeminiAdapter(async () => "cloud answer"), new LocalModelAdapter()],
    });
    const reply = await gateway.route(safeRequest);
    expect(reply.provider).toBe("local-ollama");
  });

  it("falls back to cloud when the local adapter is unavailable", async () => {
    const brokenLocal: LocalModelAdapter = new LocalModelAdapter();
    brokenLocal.isAvailable = async () => false;
    const gateway = new OmniRouteGateway({
      adapters: [brokenLocal, new GeminiAdapter(async () => "cloud answer")],
    });
    expect((await gateway.route(safeRequest)).provider).toBe("gemini");
  });

  it("keeps sensitive requests local unless consent was recorded", async () => {
    const gateway = new OmniRouteGateway({
      adapters: [new LocalModelAdapter(), new GeminiAdapter(async () => "cloud answer")],
    });
    const reply = await gateway.route(sensitiveRequest);
    expect(reply.provider).toBe("local-ollama");
  });

  it("sends sensitive requests to the cloud only when local fails and consent exists", async () => {
    const brokenLocal = new LocalModelAdapter();
    brokenLocal.isAvailable = async () => false;
    const gateway = new OmniRouteGateway({
      adapters: [brokenLocal, new GeminiAdapter(async () => "cloud answer")],
    });
    const withConsent = await gateway.route({ ...sensitiveRequest, cloudConsent: true });
    expect(withConsent.provider).toBe("gemini");
    // Without consent the request fails closed instead of leaving the device.
    await expect(gateway.route(sensitiveRequest)).rejects.toThrow("no provider allowed");
  });

  it("falls back to local when the cloud provider errors", async () => {
    const failingCloud = new GeminiAdapter(async () => {
      throw new Error("rate limited");
    });
    const gateway = new OmniRouteGateway({ adapters: [failingCloud, new LocalModelAdapter()] });
    const reply = await gateway.route(safeRequest);
    expect(reply.provider).toBe("local-ollama");
  });

  it("throws a clear error when every provider fails", async () => {
    const brokenLocal: LocalModelAdapter = new LocalModelAdapter();
    brokenLocal.isAvailable = async () => false;
    const gateway = new OmniRouteGateway({
      adapters: [brokenLocal, new GeminiAdapter(async () => { throw new Error("down"); })],
    });
    await expect(gateway.route(safeRequest)).rejects.toThrow("all providers failed");
  });
});

describe("QuotaTracker", () => {
  it("blocks a provider once its local ceiling is exhausted", () => {
    const quotas = new QuotaTracker({ gemini: 2 });
    expect(quotas.tryConsume("gemini")).toBe(true);
    expect(quotas.tryConsume("gemini")).toBe(true);
    expect(quotas.tryConsume("gemini")).toBe(false);
    expect(quotas.remaining("gemini")).toBe(0);
  });

  it("treats unknown providers as unlimited", () => {
    const quotas = new QuotaTracker({});
    expect(quotas.tryConsume("gemini")).toBe(true);
    expect(quotas.remaining("gemini")).toBe(Number.POSITIVE_INFINITY);
  });
});
