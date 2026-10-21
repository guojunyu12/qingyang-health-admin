export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}
type Options = {
  signal?: AbortSignal;
  method?: string;
  body?: unknown;
  csrf?: boolean;
  idempotencyKey?: string;
  headers?: HeadersInit;
};
let refreshing: Promise<void> | null = null;
export function safeReturnTo(value: string | null) {
  return [
    "/dashboard",
    "/nutrition",
    "/training",
    "/companion",
    "/profile",
    "/overview",
  ].includes(value ?? "")
    ? value!
    : "/dashboard";
}
async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  let result;
  try {
    result = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      "INVALID_RESPONSE",
      "服务响应异常，请稍后重试",
    );
  }
  if (!res.ok)
    throw new ApiError(
      res.status,
      result.error?.code ?? "REQUEST_FAILED",
      result.error?.message ?? "请求失败",
      result.error?.fields,
      result.error?.retryAfterSeconds,
    );
  return result.data;
}
async function csrfToken() {
  return (
    await parse<{ csrfToken: string }>(
      await fetch("/api/v1/auth/csrf", {
        credentials: "include",
        cache: "no-store",
      }),
    )
  ).csrfToken;
}
let refreshAttempt: { key: string; expires: number } | null = null;
async function refresh() {
  const csrf = await csrfToken();
  if (!refreshAttempt || refreshAttempt.expires < Date.now())
    refreshAttempt = { key: crypto.randomUUID(), expires: Date.now() + 30000 };
  const headers = {
    "Content-Type": "application/json",
    "X-CSRF-Token": csrf,
    "Idempotency-Key": refreshAttempt.key,
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
        headers,
        body: "{}",
      });
      await parse(response);
      refreshAttempt = null;
      return;
    } catch (error) {
      if (error instanceof TypeError && attempt === 0) continue;
      throw error;
    }
  }
}
export async function api<T>(
  path: string,
  options: Options = {},
  retry = true,
): Promise<T> {
  const method = options.method ?? "GET";
  if (method !== "GET" && !options.idempotencyKey)
    options = { ...options, idempotencyKey: crypto.randomUUID() };
  const headers: Record<string, string> = Object.fromEntries(new Headers(options.headers));
  headers["X-Client-Platform"] = "h5";
  if (options.idempotencyKey)
    headers["Idempotency-Key"] = options.idempotencyKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && options.csrf !== false)
    headers["X-CSRF-Token"] = await csrfToken();
  const res = await fetch("/api/v1" + path, {
    method,
    signal: options.signal,
    credentials: "include",
    cache: "no-store",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (
    res.status === 401 &&
    retry &&
    ![
      "/auth/login",
      "/auth/refresh",
      "/auth/email-codes",
      "/auth/csrf",
    ].includes(path)
  ) {
    try {
      refreshing ??= refresh().finally(() => {
        refreshing = null;
      });
      await refreshing;
      return await api<T>(path, options, false);
    } catch (error) {
      if (typeof window !== "undefined")
        window.dispatchEvent(new Event("auth-expired"));
      throw error;
    }
  }
  return parse<T>(res);
}
