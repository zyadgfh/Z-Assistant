/**
 * Shared types for the Maya platform core (development plan section 3.1).
 */

export type RiskLevel = "safe" | "sensitive" | "high";

/** Authentication levels from the permission engine (plan section 3.1 / 5.3). */
export type AuthRequirement = "none" | "voiceprint" | "voiceprint_plus_pin";

export type DecisionAction = "execute" | "confirm" | "auth_and_confirm" | "reject";

export interface Intent {
  /** Canonical intent name, e.g. `open_application`, `search_google`, `ai_query`. */
  name: string;
  /** Extracted arguments, e.g. `{ app: "Google Chrome" }` or `{ query: "python" }`. */
  args: Record<string, string>;
  /** Default risk classification for this intent. */
  risk: RiskLevel;
  /** Original command text. */
  raw: string;
  /** Detected language of the command. */
  locale: "ar" | "en" | "mixed";
}

export interface PermissionDecision {
  action: DecisionAction;
  requirement: AuthRequirement;
  /** Human-readable explanation, useful for audit logs. */
  reason: string;
}

export interface CommandContext {
  /** Developer mode is opt-in, time-limited, and never the default (plan section 10). */
  developerMode?: boolean;
  /** The user already confirmed this specific action in a visible prompt. */
  confirmed?: boolean;
  /** User consented to cloud processing for this request (plan section 2.4 item 7). */
  cloudConsent?: boolean;
}

export interface ProviderRequest {
  prompt: string;
  system?: string;
  sensitivity: RiskLevel;
  locale: "ar" | "en";
  /** Explicit owner consent to send this request to the cloud (plan 2.4.7). */
  cloudConsent?: boolean;
}

export interface ProviderReply {
  text: string;
  provider: string;
  latencyMs: number;
}

export interface ModelAdapter {
  readonly name: string;
  /** True when the adapter can currently serve requests (online, quota left, healthy). */
  isAvailable(): Promise<boolean>;
  complete(request: ProviderRequest): Promise<ProviderReply>;
}
