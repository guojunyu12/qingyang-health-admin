import { api as request, ApiError } from "../../lib/api/client";
export { ApiError };
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/v1/")) {
    throw new ApiError(404, "NOT_FOUND", "该接口未接入正式后端");
  }
  const headers = new Headers(init.headers);
  return request<T>(path.slice(7), {
    method: init.method,
    signal: init.signal ?? undefined,
    body: typeof init.body === "string" ? JSON.parse(init.body) : undefined,
    headers,
    csrf: !["/api/v1/auth/login", "/api/v1/auth/email-codes"].includes(path),
    idempotencyKey: headers.get("Idempotency-Key") ?? undefined,
  });
}
