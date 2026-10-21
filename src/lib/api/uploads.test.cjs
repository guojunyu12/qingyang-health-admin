const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { stripTypeScriptTypes } = require("node:module");
const source = fs.readFileSync(__dirname + "/uploads.ts", "utf8");
function setup(statuses, signed = {}, failures = 0) {
  const calls = [];
  const api = async (path, options) => {
    calls.push({ path, options });
    if (path === "/uploads/presign") return { assetId: "00000000-0000-4000-8000-000000000001", method: "PUT", uploadUrl: "http://127.0.0.1:3001/api/v1/uploads/local/00000000-0000-4000-8000-000000000001?signature=test", requiredHeaders: { "Content-Type": "image/png" }, ...signed };
    if (path === "/auth/csrf") return { csrfToken: "fresh" };
    if (path.endsWith("/complete")) return {};
    return { status: statuses.shift() ?? "ready" };
  };
  const fetch = async (url, options) => { calls.push({ url, options }); if (failures-- > 0) throw new TypeError("network lost"); return { ok: true }; };
  const output = stripTypeScriptTypes(source.replace(/import \{ api \} from "\.\/client";/, 'const { api } = require("./client");').replace("export async function uploadImage", "exports.uploadImage = async function uploadImage"), { mode: "transform" });
  const exports = {};
  new Function("require", "exports", "fetch", output)(() => ({ api }), exports, fetch);
  return { upload: exports.uploadImage, calls };
}
const file = new File(["image"], "cover.png", { type: "image/png" });
test("H5 signed upload is sent only through the same-origin local path", async () => {
  const { upload, calls } = setup(["pending", "ready"]);
  await upload(file, "activity_cover", { operationKey: "stable-key" });
  const put = calls.find(c => c.url);
  assert.equal(put.url, "/api/v1/uploads/local/00000000-0000-4000-8000-000000000001?signature=test");
  assert.equal(put.options.headers["X-CSRF-Token"], "fresh");
  assert.equal(calls.find(c => c.path === "/uploads/presign").options.idempotencyKey, "stable-key");
  assert.equal(calls.find(c => c.path?.endsWith("/complete")).options.idempotencyKey, "stable-key");
});
test("ready and validating retries never upload bytes again", async () => {
  for (const status of ["ready", "validating"]) {
    const { upload, calls } = setup([status, "ready"]);
    await upload(file, "reward_image", { operationKey: "same" });
    assert.equal(calls.filter(c => c.url).length, 0);
  }
});
test("unexpected path, asset id, or signed method is rejected", async () => {
  for (const signed of [{ uploadUrl: "https://example.com/private" }, { method: "POST" }, { uploadUrl: "/api/v1/uploads/local/00000000-0000-4000-8000-000000000002" }]) {
    const { upload, calls } = setup(["pending"], signed);
    await assert.rejects(upload(file, "activity_cover"));
    assert.equal(calls.filter(c => c.url).length, 0);
  }
});
test("rejected or unknown state cannot report success", async () => {
  for (const status of ["rejected", "unknown"]) {
    const { upload } = setup([status]);
    await assert.rejects(upload(file, "activity_cover"));
  }
});

test("network retry retains presign operation identity", async () => {
  const { upload, calls } = setup(["pending", "pending", "ready"], {}, 1);
  await assert.rejects(upload(file, "activity_cover", { operationKey: "retry-key" }));
  await upload(file, "activity_cover", { operationKey: "retry-key" });
  assert.deepEqual(calls.filter(c => c.path === "/uploads/presign").map(c => c.options.idempotencyKey), ["retry-key", "retry-key"]);
});
