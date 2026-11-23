/** JSON responses with scoped CORS. Origins come from env, never a bare `*`. */

export function corsHeaders(allowedOrigins: readonly string[], request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(init.headers ?? {}) },
  });
}

export function errorJson(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse({ error: { code, message } }, { status, headers });
}
