# 轻养健康运营后台

本仓库提供 M05 独立运营后台：业务概览、活动与场次编辑发布、预约及签到、积分规则与账户、数字权益与兑换订单、社区举报、站内运营消息、安全素材和审计查询。H5 页面位于 `qingyang-health-frontend`，双 API 与 MySQL 迁移位于 `qingyang-health-backend`。

## 本地运行

需要 Node.js 22.12+。先启动后端仓库中的 M05 管理 API（默认 3101）与 MySQL，再将 `.env.example` 复制为 `.env.local`，填入与后端相同的本地开发令牌：

```sh
pnpm install
pnpm run dev       # http://127.0.0.1:3002
pnpm run typecheck
pnpm run build
```

本地可选择固定管理员身份检查页面；生产环境需接入 M01 的正式身份端口，并禁用开发身份和测试供应商。消息只进入站内收件箱，不包含短信或设备推送。数据库迁移、事件消费权和外部服务边界见后端仓库 `docs/m05/repository-integration.md`。
