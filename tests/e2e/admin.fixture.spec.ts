import { test, expect, type Page, type Route } from "@playwright/test";

// UI contract fixtures only: every API request is intercepted, never forwarded to a database.
const admin = { id: "00000000-0000-4000-8000-000000000001", nickname: "管理员甲",
  roles: ["admin"], identityMode: "m01_email", csrfToken: "fixture-csrf" };
const activityId = "00000000-0000-4000-8000-000000000010";
const slotId = "00000000-0000-4000-8000-000000000020";
const assetId = "00000000-0000-4000-8000-000000000030";
const reportId = "00000000-0000-4000-8000-000000000040";
const campaignId = "00000000-0000-4000-8000-000000000050";
const activity = () => ({ id: activityId, title: "测试散步活动", category: "walking",
  description: "这是隔离的界面测试内容", locationName: "测试集合点", address: "测试地址",
  latitude: null, longitude: null, visibility: "public", status: "draft", version: 1 });
const slot = () => ({ id: slotId, activityId, startAt: "2026-11-01T02:00:00Z",
  endAt: "2026-11-01T03:00:00Z", bookingOpenAt: "2026-10-20T00:00:00Z",
  bookingCloseAt: "2026-11-01T01:00:00Z", cancelBeforeAt: "2026-11-01T00:00:00Z",
  capacity: 10, bookedCount: 2, remainingSeats: 8, status: "open", version: 1 });
const json = (route: Route, data: unknown) => route.fulfill({ json: { data } });
const error = (route: Route, status: number, code: string, message: string) =>
  route.fulfill({ status, json: { error: { code, message } } });
const list = (items: unknown[]) => ({ items, nextCursor: null });
async function fixture(page: Page, handle: (route: Route, path: string) => Promise<boolean>) {
  await page.route("**/api/v1/**", async route => {
    const path = new URL(route.request().url()).pathname.replace("/api/v1", "");
    if (!["GET", "PUT"].includes(route.request().method())) {
      const headers = route.request().headers();
      expect(headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
      if (!path.startsWith("/auth/")) expect(headers["x-csrf-token"]).toBe("fixture-csrf");
    }
    if (await handle(route, path)) return;
    if (path === "/me/m05-session") return json(route, admin);
    if (path === "/auth/csrf") return json(route, { csrfToken: "fixture-csrf" });
    if (path === "/admin/media-assets") return json(route, list([]));
    // Fail closed: an unhandled API cannot accidentally reach the real backend.
    return error(route, 501, "UNHANDLED_FIXTURE", path);
  });
}

test("活动编辑发布归档、同身份 focus 保留编辑、双管理员版本冲突恢复", async ({ page }) => {
  let current = activity();
  let writes = 0;
  await fixture(page, async (route, path) => {
    if (path !== "/admin/activities" && path !== `/admin/activities/${activityId}` &&
      path !== `/admin/activities/${activityId}/publish` && path !== `/admin/activities/${activityId}/archive`) return false;
    const request = route.request();
    if (request.method() === "GET") await json(route, list([current]));
    else {
      const body = request.postDataJSON();
      if (request.method() === "PATCH" && writes++ === 0) {
        current = { ...current, title: "另一管理员的新标题", version: 2 };
        await error(route, 409, "VERSION_CONFLICT", "内容版本已变化");
      } else {
        if (path.endsWith("/publish")) current = { ...current, status: "published", version: 4 };
        else if (path.endsWith("/archive")) current = { ...current, status: "archived", version: 5 };
        else current = { ...current, ...body, version: 3 };
        await json(route, current);
      }
    }
    return true;
  });
  await page.goto("/activities");
  await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await page.getByLabel("活动标题", { exact: true }).fill("本次尚未保存的标题");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByLabel("活动标题", { exact: true })).toHaveValue("本次尚未保存的标题");
  await page.getByRole("button", { name: "保存活动", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("内容版本已变化");
  await page.getByRole("button", { name: "关闭并刷新最新版本（放弃本次编辑）" }).click();
  await expect(page.getByRole("heading", { name: "另一管理员的新标题" })).toBeVisible();
  await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await expect(page.getByLabel("活动标题", { exact: true })).toHaveValue("另一管理员的新标题");
  await page.getByLabel("活动标题", { exact: true }).fill("已合并修改的活动");
  await page.getByRole("button", { name: "保存活动", exact: true }).click();
  await page.getByRole("button", { name: "发布活动", exact: true }).click();
  await expect(page.locator(".pill").filter({ hasText: /^已发布$/ })).toBeVisible();
  await page.getByRole("button", { name: "归档活动", exact: true }).click();
  await page.getByLabel("归档原因").fill("测试活动结束");
  await page.getByRole("button", { name: "确认归档", exact: true }).click();
  await expect(page.locator(".pill").filter({ hasText: /^已归档$/ })).toBeVisible();
});

test("取消整个场次发送版本与原因，刷新后展示释放的名额", async ({ page }) => {
  let current = slot();
  await fixture(page, async (route, path) => {
    if (path === "/admin/activities") await json(route, list([activity()]));
    else if (path === `/admin/activities/${activityId}`) await json(route, activity());
    else if (path === `/admin/activities/${activityId}/slots`) await json(route, list([current]));
    else if (path === `/admin/activity-slots/${slotId}/cancel`) {
      expect(route.request().postDataJSON()).toEqual({ version: 1, reason: "测试场次取消" });
      current = { ...current, status: "canceled", bookedCount: 0, remainingSeats: 10, version: 2 };
      await json(route, current);
    } else return false;
    return true;
  });
  await page.goto(`/slots?activityId=${activityId}`);
  await page.getByRole("button", { name: "取消场次", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认取消场次", exact: true })).toBeDisabled();
  await page.getByLabel("取消场次原因").fill("测试场次取消");
  await page.getByRole("button", { name: "确认取消场次", exact: true }).click();
  await expect(page.locator(".slot-row")).toContainText("已取消");
  await expect(page.locator(".slot-row")).toContainText("已占 0 / 10");
});

test("举报审核要求说明，提交后从待处理列表移除", async ({ page }) => {
  let resolved = false;
  await fixture(page, async (route, path) => {
    if (path === "/admin/community/reports") await json(route, list(resolved ? [] : [{
      id: reportId, targetType: "activity", targetId: activityId, reporterUserId: admin.id,
      reason: "misleading", description: "内容需检查", status: "pending", createdAt: "2026-10-20T00:00:00Z",
    }]));
    else if (path === `/admin/community/reports/${reportId}/resolve`) {
      expect(route.request().postDataJSON()).toEqual({ resolution: "dismiss", note: "已核对内容" });
      resolved = true; await json(route, {});
    } else return false;
    return true;
  });
  await page.goto("/reports");
  await page.getByRole("button", { name: "处理举报", exact: true }).click();
  await expect(page.getByRole("button", { name: "确认处理", exact: true })).toBeDisabled();
  await page.getByLabel("审核说明").fill("已核对内容");
  await page.getByRole("button", { name: "确认处理", exact: true }).click();
  await expect(page.getByText("举报已处理并记录审计。")).toBeVisible();
  await expect(page.getByText("暂无符合条件的记录")).toBeVisible();
});

test("素材选择文件后 focus 不丢失，通过 M01 上传并显示 ready", async ({ page }) => {
  let ready = false;
  let put = 0;
  await fixture(page, async (route, path) => {
    if (path === "/admin/media-assets") await json(route, list(ready ? [{ assetId,
      purpose: "activity_cover", status: "ready", contentType: "image/png", sizeBytes: 68 }] : []));
    else if (path === "/uploads/presign") await json(route, { assetId, method: "PUT",
      uploadUrl: `http://127.0.0.1:3001/api/v1/uploads/local/${assetId}?token=fixture`, requiredHeaders: { "Content-Type": "image/png" } });
    else if (path === `/uploads/${assetId}`) await json(route, { status: ready ? "ready" : "pending" });
    else if (path === `/uploads/local/${assetId}`) { put++; await route.fulfill({ status: 204 }); }
    else if (path === `/uploads/${assetId}/complete`) { ready = true; await json(route, {}); }
    else return false;
    return true;
  });
  await page.goto("/assets");
  await page.getByLabel("选择图片").setInputFiles({ name: "fixture.png", mimeType: "image/png",
    buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64") });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("button", { name: "上传并校验" })).toBeEnabled();
  await page.getByRole("button", { name: "上传并校验" }).click();
  await expect(page.getByRole("status")).toContainText("素材已校验完成");
  await expect(page.locator(".asset-card")).toContainText(assetId);
  await expect(page.locator(".asset-card")).toContainText("可使用");
  expect(put).toBe(1);
});

test("运营草稿预览发送，部分失败与仅重试失败项结果可见", async ({ page }) => {
  let status = "draft";
  let version = 1;
  let sends = 0;
  await fixture(page, async (route, path) => {
    if (path === `/admin/message-campaigns/${campaignId}`) await json(route, { id: campaignId,
      title: "测试运营通知", body: "测试内容", actionPath: "/messages", recipientUserIds: [admin.id],
      status, version, counts: { succeeded: status === "completed" ? 1 : 0, failed: status === "partial_failed" ? 1 : 0 } });
    else if (path.endsWith("/recipients")) await json(route, list(status === "draft" ? [] : [{
      id: "recipient", userId: admin.id, nickname: "测试接收人", status: status === "completed" ? "succeeded" : "failed",
      attempts: version - 1, errorCode: status === "completed" ? null : "TEST_FAILURE", readAt: null, deliveries: [],
    }]));
    else if (path.endsWith("/send")) { sends++; status = "partial_failed"; version++; await json(route, {}); }
    else if (path.endsWith("/retry")) { expect(sends).toBe(1); status = "completed"; version++; await json(route, {}); }
    else return false;
    return true;
  });
  await page.goto(`/messages/${campaignId}`);
  await page.getByRole("button", { name: "预览并发送" }).click();
  await expect(page.getByRole("dialog")).toContainText("提交后冻结内容和接收人");
  await page.getByRole("button", { name: "确认发送给 1 人" }).click();
  await expect(page.getByText("部分处理失败", { exact: true })).toBeVisible();
  await expect(page.getByText("TEST_FAILURE", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "仅重试失败接收人" }).click();
  await expect(page.getByText("全部处理完成", { exact: true })).toBeVisible();
  await expect(page.getByText("已进入站内收件箱 · 尝试 2 次")).toBeVisible();
  await expect(page.getByText("外部设备投递记录 0 条")).toBeVisible();
});

test("普通账号显示403响应，切换管理员后不保留前一账号草稿", async ({ page }) => {
  let identity = { ...admin };
  await fixture(page, async (route, path) => {
    if (path === "/me/m05-session") await json(route, identity);
    else if (path === "/admin/overview") await error(route, 403, "ADMIN_REQUIRED", "当前账号没有管理权限");
    else if (path === "/admin/activities") await json(route, list([activity()]));
    else return false;
    return true;
  });
  await page.goto("/activities");
  await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await page.getByLabel("活动标题", { exact: true }).fill("甲的私有草稿");
  identity = { ...admin, id: "00000000-0000-4000-8000-000000000002", nickname: "普通用户", roles: [] };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "403 · 无管理权限" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  identity = { ...admin, id: "00000000-0000-4000-8000-000000000003", nickname: "管理员乙" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await expect(page.getByLabel("活动标题", { exact: true })).toHaveValue("测试散步活动");
  await expect(page.getByText("管理员乙", { exact: true })).toBeVisible();
});

test("创建活动与场次使用正式字段，保存成功后刷新列表", async ({ page }) => {
  let created = false;
  let slotCreated = false;
  await fixture(page, async (route, path) => {
    if (path === "/admin/activities") {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toMatchObject({ title: "新测试活动", coverAssetId: null,
          latitude: null, longitude: null, visibility: "public" });
        created = true; await json(route, activity());
      } else await json(route, list(created ? [{ ...activity(), title: "新测试活动" }] : []));
    } else if (path === `/admin/activities/${activityId}`) await json(route, activity());
    else if (path === `/admin/activities/${activityId}/slots`) {
      if (route.request().method() === "POST") {
        expect(route.request().postDataJSON()).toMatchObject({ capacity: 10 });
        expect(route.request().postDataJSON().startAt).toMatch(/Z$/);
        slotCreated = true; await json(route, slot());
      } else await json(route, list(slotCreated ? [slot()] : []));
    } else return false;
    return true;
  });
  await page.goto("/activities");
  await page.getByRole("button", { name: "创建活动", exact: true }).click();
  await page.getByLabel("活动标题", { exact: true }).fill("新测试活动");
  await page.getByLabel("活动说明").fill("测试活动说明");
  await page.getByLabel("集合地点").fill("测试地点");
  await page.getByLabel("详细地址").fill("测试地址");
  await page.getByRole("button", { name: "保存活动", exact: true }).click();
  await expect(page.getByRole("heading", { name: "新测试活动" })).toBeVisible();
  await page.getByRole("link", { name: "管理场次", exact: true }).click();
  await page.getByRole("button", { name: "新增场次", exact: true }).click();
  await page.getByRole("button", { name: "保存场次", exact: true }).click();
  await expect(page.locator(".slot-row")).toContainText("开放中");
});

test("运营概览从正式 runtime 路由读取并显示实际统计值", async ({ page }) => {
  let runtimeRead = false;
  await fixture(page, async (route, path) => {
    if (path === "/admin/runtime") { runtimeRead = true; await json(route, {}); }
    else if (path === "/admin/overview") await json(route, { totalAvailablePoints: 123,
      publishedActivities: 2, confirmedBookings: 3, publishedRewards: 4,
      pendingRedemptions: 5, openReports: 6, sentCampaigns: 7, unreadNotifications: 8 });
    else return false;
    return true;
  });
  await page.goto("/overview");
  await expect(page.locator(".stat strong")).toHaveText(["123", "2", "3", "4", "5", "6", "7", "8"]);
  expect(runtimeRead).toBe(true);
});

test("角色已移除时即使管理接口500也立即清除旧管理员草稿", async ({ page }) => {
  let roles = ["admin"];
  await fixture(page, async (route, path) => {
    if (path === "/me/m05-session") await json(route, { ...admin, roles });
    else if (path === "/admin/overview") await error(route, 500, "UNAVAILABLE", "管理服务暂时不可用");
    else if (path === "/admin/activities") await json(route, list([activity()]));
    else return false;
    return true;
  });
  await page.goto("/activities");
  await page.getByRole("button", { name: "编辑活动", exact: true }).click();
  await page.getByLabel("活动标题", { exact: true }).fill("已失去权限的管理员草稿");
  roles = [];
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("heading", { name: "403 · 无管理权限" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("管理员甲", { exact: true })).toHaveCount(0);
});
