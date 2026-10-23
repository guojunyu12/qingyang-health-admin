# 轻养运营后台

独立 Git 仓库，来源 `dcad15f`，本轮适配 M01 邮箱身份与唯一正式后端；未发布。

## 启动

使用 Node >=22.12，按 `pnpm-lock.yaml` 安装依赖（`pnpm install --frozen-lockfile`）。独立锁安装、类型和构建验证见 `docs/integration/M05_整改记录_2026-10-23_后台浏览器.md`。

```sh
API_INTERNAL_URL=http://127.0.0.1:3002 npm run dev
npm run typecheck
npm run build
npm start
```

浏览器访问 http://127.0.0.1:3003 。正式后端需允许 `ADMIN_ORIGIN=http://127.0.0.1:3003`，同时提供 M01 邮箱验证码、登录、刷新、CSRF、退出及 M05 管理接口。API_INTERNAL_URL 是服务端配置，构建与启动环境保持一致。

邮箱验证码使用真实邮件通道。登录后由后端校验 admin 角色；本仓库不创建管理员、不提供测试身份或提权入口。普通账号收到真实 403。管理员授权由项目管理员按后端受控流程处理。

## 功能范围

- 积分规则、账户对账和积分流水。
- 活动、场次、预约签到和社区举报审核。
- 权益目录和兑换订单。
- 运营消息草稿、发送和接收人记录；发送操作由运营人员自行确认。
- 素材列表、封面选择、审计记录及 M01 正式图片上传；复用预签、校验和 Worker，不创建第二套存储。

后台提供两套独立浏览器验收：`pnpm test:e2e` 使用明确拦截的 API fixture；`pnpm test:e2e:live` 连接显式隔离测试库、M01 身份及统一 Worker，所需配置和实际证据见本轮整改记录。真实供应商和线上环境仍需单独验收。

规范入口见 AGENTS.md 与 docs/integration/。本轮无数据库变更；整改候选提交推送后交主整合窗口审核，未合 main、未部署。详见 [整改记录](docs/integration/M05_整改记录_2026-10-23.md)。
