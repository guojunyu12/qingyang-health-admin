# 轻养运营后台

本仓库独立于 H5 与 server，调用唯一正式后端，不创建用户、会话、数据库或存储。
开发、审查和提交前依次读取 docs/integration/模块合并规范.md、模块合并台账.md、模块合并记录模板.md、团队开发与Git提交规范.md；交付使用模块交付与PR说明模板.md。
修改 Next.js 前阅读当前 node_modules/next/dist/docs/ 对应指南。禁止覆盖其他窗口改动、连接正式库测试、自行合 main 或发布。

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
