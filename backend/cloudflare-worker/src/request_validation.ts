/**
 * Request validation for /v1/assistant. Fails closed with structured errors;
 * never echoes user text back into error messages.
 */

export const MAX_BODY_BYTES = 16 * 1024; // 16 KB
export const MAX_TEXT_LENGTH = 500;

export interface ValidationError {
  status: number;
  code: string;
  message: string;
}

export interface ValidatedRequest {
  text: string;
  locale: "auto" | "ar" | "ar-EG" | "en";
  deviceId: string | null;
}

export function validateContentType(request: Request): ValidationError | null {
  const contentType = request.headers.get("Content-Type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { status: 415, code: "unsupported_media_type", message: "استخدم Content-Type: application/json." };
  }
  return null;
}

export function validateBody(raw: string): { ok: true; value: ValidatedRequest } | { ok: false; error: ValidationError } {
  // Byte-length check catches oversized bodies before JSON parsing.
  const bytes = new TextEncoder().encode(raw);
  if (bytes.length > MAX_BODY_BYTES) {
    return { ok: false, error: { status: 413, code: "payload_too_large", message: `حجم الطلب يتجاوز ${MAX_BODY_BYTES} بايت.` } };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: { status: 400, code: "invalid_json", message: "المحتوى ليس JSON صالحًا." } };
  }

  const body = parsed as { text?: unknown; locale?: unknown; deviceId?: unknown };
  if (typeof body.text !== "string") {
    return { ok: false, error: { status: 400, code: "missing_text", message: "الحقل text مطلوب." } };
  }
  const text = body.text.trim();
  if (!text) {
    return { ok: false, error: { status: 400, code: "empty_text", message: "لا يمكن أن يكون النص فارغًا." } };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return { ok: false, error: { status: 400, code: "text_too_long", message: `الحد الأقصى للنص ${MAX_TEXT_LENGTH} حرفًا.` } };
  }

  const locale = body.locale === "ar" || body.locale === "ar-EG" || body.locale === "en" ? body.locale : "auto";
  const deviceId = typeof body.deviceId === "string" ? body.deviceId.trim().slice(0, 128) || null : null;
  return { ok: true, value: { text, locale, deviceId } };
}

/** Client IP for rate limiting; Cloudflare provides it as a verified header. */
export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ?? "unknown";
}
