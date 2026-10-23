import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

type Account = { id: string; email: string; nickname?: string };
type Fixture = { adminA: Account; adminB: Account; user: Account; database?: string };
const fixture = JSON.parse(readFileSync(process.env.ADMIN_LIVE_FIXTURE_FILE!, "utf8")) as Fixture;
if (![fixture.adminA, fixture.adminB, fixture.user].every(account => account.email.endsWith("@example.test"))) {
  throw Error("Live browser tests only accept synthetic example.test accounts from the isolated harness.");
}
const mailFile = process.env.ADMIN_LIVE_MAIL_FILE!;
const h5URL = process.env.ADMIN_LIVE_H5_URL || "http://127.0.0.1:3301";
const baseURL = `http://127.0.0.1:${Number(process.env.ADMIN_E2E_PORT || 4303)}`;
async function login(page: Page, account: Account) {
  await page.goto(baseURL + "/activities");
  await page.getByLabel("邮箱", { exact: true }).fill(account.email);
  const sent = page.waitForResponse(response => response.url().endsWith("/auth/email-codes") && response.request().method() === "POST");
  await page.getByRole("button", { name: "发送验证码（请间隔一分钟重试）" }).click();
  expect((await sent).ok()).toBeTruthy();
  let code = "";
  await expect.poll(() => {
    try {
      const messages = JSON.parse(readFileSync(mailFile, "utf8")) as Record<string, { code: string }>;
      code = messages[account.email]?.code || "";
      return code;
    } catch { return ""; }
  }).toMatch(/^\d{6}$/);
  await page.getByLabel("验证码", { exact: true }).fill(code);
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
async function command(context: BrowserContext, path: string, body: object) {
  const csrfResponse = await context.request.get(h5URL + "/api/v1/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const { data } = await csrfResponse.json();
  const response = await context.request.post(h5URL + "/api/v1" + path, {
    headers: { Origin: h5URL, "X-CSRF-Token": data.csrfToken,
      "Idempotency-Key": randomUUID(), "X-Client-Platform": "h5" }, data: body,
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()).data;
}

test("live: M01 登录、双管理员冲突、预约取消、举报审核、素材、站内消息与权限", async ({ browser }) => {
  // No route interception, fake cookies, DB writes, real mailbox, or external supplier calls here.
  // Synthetic accounts and roles are created solely by the explicit _test backend harness.
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const contextUser = await browser.newContext();
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  const user = await contextUser.newPage();
  const title = `后台浏览器验收 ${Date.now()}`;
  try {
    await login(a, fixture.adminA);
    await expect(a.getByRole("button", { name: "创建活动", exact: true })).toBeVisible();
    await a.goto(baseURL + "/overview");
    await expect(a.locator(".stat strong")).toHaveCount(8);
    for (const value of await a.locator(".stat strong").all()) {
      await expect(value).toHaveText(/^\d+$/);
    }
    await a.goto(baseURL + "/activities");
    await login(b, fixture.adminB);
    await expect(b.getByRole("button", { name: "创建活动", exact: true })).toBeVisible();
    await login(user, fixture.user);
    await expect(user.getByRole("heading", { name: "403 · 无管理权限" })).toBeVisible();

    await a.getByRole("button", { name: "创建活动", exact: true }).click();
    await a.getByLabel("活动标题", { exact: true }).fill(title);
    await a.getByLabel("活动说明").fill("仅用于隔离测试库的后台浏览器验收");
    await a.getByLabel("集合地点").fill("测试集合点");
    await a.getByLabel("详细地址").fill("测试地址");
    const create = a.waitForResponse(response => response.url().endsWith("/admin/activities") && response.request().method() === "POST");
    await a.getByRole("button", { name: "保存活动", exact: true }).click();
    const createResponse = await create;
    expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
    const activity = (await createResponse.json()).data;
    const cardA = a.locator("section.card").filter({ has: a.getByRole("heading", { name: title, exact: true }) });
    await cardA.getByRole("button", { name: "编辑活动", exact: true }).click();
    await a.getByLabel("活动标题", { exact: true }).fill(title + " 甲编辑");

    await b.reload();
    await b.locator("section.card").filter({ has: b.getByRole("heading", { name: title, exact: true }) })
      .getByRole("button", { name: "编辑活动", exact: true }).click();
    await b.getByLabel("活动标题", { exact: true }).fill(title + " 乙编辑");
    await b.getByRole("button", { name: "保存活动", exact: true }).click();
    await expect(b.getByRole("heading", { name: title + " 乙编辑", exact: true })).toBeVisible();
    await a.getByRole("button", { name: "保存活动", exact: true }).click();
    await expect(a.getByRole("button", { name: "关闭并刷新最新版本（放弃本次编辑）" })).toBeVisible();
    await a.getByRole("button", { name: "关闭并刷新最新版本（放弃本次编辑）" }).click();
    const updatedCard = a.locator("section.card").filter({ has: a.getByRole("heading", { name: title + " 乙编辑", exact: true }) });
    await updatedCard.getByRole("button", { name: "发布活动", exact: true }).click();
    await expect(updatedCard.locator(".pill")).toHaveText("已发布");
    await updatedCard.getByRole("link", { name: "管理场次", exact: true }).click();
    await a.getByRole("button", { name: "新增场次", exact: true }).click();
    const createSlot = a.waitForResponse(response => response.url().endsWith(`/activities/${activity.id}/slots`) && response.request().method() === "POST");
    await a.getByRole("button", { name: "保存场次", exact: true }).click();
    const slotResponse = await createSlot;
    expect(slotResponse.ok(), await slotResponse.text()).toBeTruthy();
    const slot = (await slotResponse.json()).data;
    const booking = await command(contextUser, "/me/bookings", { slotId: slot.id, participantVisibility: "hidden" });
    await a.reload();
    await expect(a.locator(".slot-row")).toContainText("已占 1 / 10");
    await a.getByRole("button", { name: "取消场次", exact: true }).click();
    await a.getByLabel("取消场次原因").fill("隔离浏览器测试取消");
    await a.getByRole("button", { name: "确认取消场次", exact: true }).click();
    await expect(a.locator(".slot-row")).toContainText("已占 0 / 10");
    const bookingResponse = await contextUser.request.get(baseURL + `/api/v1/me/bookings/${booking.id}`);
    expect((await bookingResponse.json()).data.status).toBe("canceled");

    const report = await command(contextUser, "/community/reports", { targetType: "activity", targetId: activity.id,
      reason: "other", description: title });
    await a.goto(baseURL + "/reports");
    const reportCard = a.locator("section.card").filter({ hasText: report.id });
    await reportCard.getByRole("button", { name: "处理举报", exact: true }).click();
    await a.getByLabel("审核说明").fill("仅用于测试，已核对并驳回");
    await a.getByRole("button", { name: "确认处理", exact: true }).click();
    await expect(a.getByText("举报已处理并记录审计。")).toBeVisible();

    await a.goto(baseURL + "/assets");
    const png = await a.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = 16; canvas.height = 16;
      const context = canvas.getContext("2d")!; context.fillStyle = "#24896b"; context.fillRect(0, 0, 16, 16);
      return canvas.toDataURL("image/png").split(",")[1];
    });
    await a.getByLabel("选择图片").setInputFiles({ name: "live-fixture.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
    await a.evaluate(() => window.dispatchEvent(new Event("focus")));
    const presign = a.waitForResponse(response => response.url().endsWith("/uploads/presign") && response.request().method() === "POST");
    await a.getByRole("button", { name: "上传并校验" }).click();
    const asset = (await (await presign).json()).data;
    await expect(a.getByRole("status")).toContainText("素材已校验完成", { timeout: 60000 });
    await expect(a.locator(".asset-card").last()).toContainText("可使用");

    await a.goto(baseURL + "/activities");
    const coverCard = a.locator("section.card").filter({ has: a.getByRole("heading", { name: title + " 乙编辑", exact: true }) });
    await coverCard.getByRole("button", { name: "编辑活动", exact: true }).click();
    await a.getByLabel("选择已验证封面").selectOption(asset.assetId);
    await a.getByRole("button", { name: "保存活动", exact: true }).click();
    await expect(coverCard.getByRole("img")).toBeVisible();
    await expect.poll(() => coverCard.getByRole("img").evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

    await a.goto(baseURL + "/messages");
    await a.getByRole("button", { name: "创建运营消息", exact: true }).click();
    await a.getByLabel("消息标题").fill(title + " 运营通知");
    await a.getByLabel("消息正文").fill("隔离测试库站内消息，不发送外部推送");
    await a.locator(".checkbox-label").filter({ hasText: fixture.user.id }).getByRole("checkbox").check();
    await a.getByRole("button", { name: "保存消息草稿", exact: true }).click();
    await a.getByRole("button", { name: "预览并发送", exact: true }).click();
    await a.getByRole("button", { name: "确认发送给 1 人", exact: true }).click();
    await expect(a.locator(".message-preview .pill")).toHaveText("全部处理完成", { timeout: 60000 });
    await expect(a.locator(".recipient-result")).toContainText("已进入站内收件箱");
    const notices = await contextUser.request.get(baseURL + "/api/v1/me/notifications?limit=100");
    expect((await notices.json()).data.items.some((notice: { title: string }) => notice.title === title + " 运营通知")).toBe(true);
    await a.screenshot({ path: "test-results/admin-live-campaign.png", fullPage: true });
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: "test-results/admin-live-mobile.png", fullPage: true });
    await a.setViewportSize({ width: 1280, height: 900 });
    await a.goto(baseURL + "/activities");
    const archiveCard = a.locator("section.card").filter({ has: a.getByRole("heading", { name: title + " 乙编辑", exact: true }) });
    await archiveCard.getByRole("button", { name: "归档活动", exact: true }).click();
    await a.getByLabel("归档原因").fill("后台浏览器验收完成");
    await a.getByRole("button", { name: "确认归档", exact: true }).click();
    await expect(archiveCard.locator(".pill")).toHaveText("已归档");
    await a.getByRole("button", { name: "退出登录", exact: true }).click();
    await expect(a.getByRole("heading", { name: "登录运营后台", exact: true })).toBeVisible();
  } finally {
    await contextA.close(); await contextB.close(); await contextUser.close();
  }
});
