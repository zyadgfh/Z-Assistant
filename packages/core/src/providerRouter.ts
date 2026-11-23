/**
 * OmniRoute Gateway (plan sections 2.4 and 11 / stage 3).
 *
 * Policy:
 *  1. The local model serves whenever it can handle the request.
 *  2. Cloud providers are used for quality or when local is unavailable.
 *  3. Provider quotas are tracked locally; switch happens before an expected
 *     exhaustion when the provider exposes counters.
 *  4. Sensitive/high requests never leave the device without explicit consent.
 *  5. No infinite retries: each adapter is tried once, in priority order.
 */

import type { ModelAdapter, ProviderReply, ProviderRequest } from "./types";

/** Deterministic quota tracker with local ceilings per provider. */
export class QuotaTracker {
  private readonly limits: Readonly<Record<string, number>>;
  private readonly used: Map<string, number> = new Map();

  constructor(limits: Record<string, number>) {
    this.limits = { ...limits };
  }

  remaining(provider: string): number {
    const limit = this.limits[provider];
    if (limit === undefined) return Number.POSITIVE_INFINITY;
    return Math.max(0, limit - (this.used.get(provider) ?? 0));
  }

  /** Returns false when the provider has no quota left. */
  tryConsume(provider: string, cost = 1): boolean {
    if (this.remaining(provider) < cost) return false;
    this.used.set(provider, (this.used.get(provider) ?? 0) + cost);
    return true;
  }
}

/** Always-available local adapter placeholder; a real runtime plugs in later. */
export class LocalModelAdapter implements ModelAdapter {
  readonly name = "local-ollama";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    return {
      provider: this.name,
      latencyMs: 0,
      text:
        request.system ??
        (request.locale === "ar"
          ? "النموذج المحلي سيجيب هنا دون إرسال البيانات خارج الجهاز."
          : "The local model would answer here without leaving the device."),
    };
  }
}

/**
 * Cloud adapter with an injectable transport so tests never touch the network.
 * The transport must throw when the provider is unreachable or rate-limited.
 */
export class GeminiAdapter implements ModelAdapter {
  readonly name = "gemini";

  constructor(
    private readonly transport: (request: ProviderRequest) => Promise<string>,
    private readonly quota?: QuotaTracker,
  ) {}

  async isAvailable(): Promise<boolean> {
    return this.quota ? this.quota.remaining(this.name) > 0 : true;
  }

  async complete(request: ProviderRequest): Promise<ProviderReply> {
    if (this.quota && !this.quota.tryConsume(this.name)) {
      throw new Error(`quota exhausted for ${this.name}`);
    }
    const started = Date.now();
    const text = await this.transport(request);
    return { text, provider: this.name, latencyMs: Date.now() - started };
  }
}

export interface OmniRouteOptions {
  /** Priority order; the first available adapter wins. */
  adapters: ModelAdapter[];
  quotas?: QuotaTracker;
}

export class OmniRouteGateway {
  constructor(private readonly options: OmniRouteOptions) {}

  async route(request: ProviderRequest): Promise<ProviderReply> {
    const { adapters } = this.options;
    const errors: string[] = [];

    // Policy rule 1: the local model serves whenever it can, regardless of the
    // order adapters were registered in.
    const isLocalAdapter = (name: string) => name.startsWith("local");
    const ordered = [
      ...adapters.filter((a) => isLocalAdapter(a.name)),
      ...adapters.filter((a) => !isLocalAdapter(a.name)),
    ];

    for (const adapter of ordered) {
      // Rule 4: sensitive/high stays local unless the user consented explicitly.
      const isLocal = isLocalAdapter(adapter.name);
      const blockedByPolicy = request.sensitivity !== "safe" && !isLocal && !request.cloudConsent;
      const allowed = !blockedByPolicy && (await safeIsAvailable(adapter));

      if (!allowed) continue;
      try {
        return await adapter.complete(request);
      } catch (error) {
        errors.push(`${adapter.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(
      errors.length
        ? `all providers failed -> ${errors.join(" | ")}`
        : "no provider allowed for this request",
    );
  }
}

async function safeIsAvailable(adapter: ModelAdapter): Promise<boolean> {
  try {
    return await adapter.isAvailable();
  } catch {
    return false;
  }
}

export const omniroute = { QuotaTracker, LocalModelAdapter, GeminiAdapter, OmniRouteGateway };
