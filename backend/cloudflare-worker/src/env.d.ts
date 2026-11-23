/** Bindings for the Maya worker. Secrets come from `wrangler secret put` only. */
export interface Env {
  /** Gemini API key — server-side only, never in the app or the repository. */
  GEMINI_API_KEY?: string | undefined;
  /** Comma-separated allowed origins for CORS; `*` is refused in production. */
  ALLOWED_ORIGINS?: string | undefined;
  /** Daily request ceiling per client IP. */
  DAILY_REQUEST_LIMIT?: string | undefined;
  /** Gemini model id, e.g. gemini-2.5-flash. */
  GEMINI_MODEL?: string | undefined;
}
