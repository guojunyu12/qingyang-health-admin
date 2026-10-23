const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const source = stripTypeScriptTypes(
  readFileSync(__dirname + "/client.ts", "utf8").replace(/^export /gm, ""),
  { mode: "transform" },
);
const response = data => new Response(JSON.stringify({ data }), { status: 200 });
function setup(fetch) { return new Function("fetch", source + "; return { api };")(fetch); }

test("explicit M05 request headers remain single values after normalization", async () => {
  const requests = [];
  const { api } = setup(async (url, options) => {
    if (url.endsWith("/auth/csrf")) return response({ csrfToken: "fresh-csrf" });
    requests.push(new Headers(options.headers));
    return response({ saved: true });
  });
  const key = "00000000-0000-4000-8000-000000000001";
  await api("/admin/activities", { method: "POST", body: {}, idempotencyKey: key,
    headers: { "Idempotency-Key": key, "X-CSRF-Token": "stale-csrf" } });
  assert.equal(requests[0].get("idempotency-key"), key);
  assert.equal(requests[0].get("x-csrf-token"), "fresh-csrf");
});

test("401 refresh retries the original mutation with one stable idempotency key", async () => {
  const requests = [];
  const { api } = setup(async (url, options) => {
    if (url.endsWith("/auth/csrf")) return response({ csrfToken: "fresh-csrf" });
    if (url.endsWith("/auth/refresh")) return response({ refreshed: true });
    requests.push(new Headers(options.headers));
    return requests.length === 1
      ? new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 })
      : response({ saved: true });
  });
  const key = "00000000-0000-4000-8000-000000000002";
  await api("/admin/activities", { method: "POST", body: {}, idempotencyKey: key,
    headers: { "idempotency-key": key, "x-csrf-token": "old" } });
  assert.equal(requests.length, 2);
  for (const headers of requests) {
    assert.equal(headers.get("idempotency-key"), key);
    assert.equal(headers.get("x-csrf-token"), "fresh-csrf");
  }
});
