# habit — 习惯打卡工具

一个 AI 陪伴的习惯追踪工具，帮助用户建立习惯、每日打卡、通过教练对话调整计划。

## 仓库结构

本仓库包含两个版本的代码，并列存放：

```
.
├── miniprogram/    ← 微信小程序版（当前主力，微信云开发）
└── pwa/            ← PWA 版（历史归档，不再维护）
```

### miniprogram/ — 微信小程序版

- **状态**：当前主力开发方向
- **运行环境**：微信小程序 + 微信云开发（`cloudbase-6g0gwb23bc2fde21`）
- **登录**：openid 自动识别，无账号密码
- **打开方式**：微信开发者工具 -> 导入项目 -> 选择 `miniprogram/` 目录
- **云函数**：`miniprogram/cloudfunctions/` 下 14 个云函数（getData / putData / chat / claimLegacy / seedLegacy / reminder / saveReminder / getExerciseData / getActivityData / getHomeData / getUserInfo / getUserProfile / recordExercise / updateUserGoal）
- **Ark API Key**：`chat` 云函数需在云开发控制台配置 `ARK_API_KEY` / `ARK_MODEL`

### pwa/ — PWA 版（归档）

- **状态**：不再维护，作为历史归档保留
- **技术栈**：Node.js + Express，Docker 容器部署（原极空间 NAS）
- **多账号**：`USER_*` 环境变量配置，admin/test1/test2 三个测试账号
- **入口**：`pwa/public/index.html`（前端）、`pwa/server.js`（后端）
- **部署**：见 `pwa/部署说明.md`（历史文档，仅供回看）

## 版本管理约定

- **小程序改动**：commit 消息前缀 `feat(miniprogram):` / `fix(miniprogram):`
- **PWA 改动**：commit 消息前缀 `feat(habit-pwa):` / `fix(habit-pwa):`（历史遗留，未来不再有新增）

## 迁移背景

- 早期：`habit-cloud-pwa`（本仓库 `pwa/` 目录），部署在极空间容器
- 2026-07-06：完成小程序云开发迁移，数据、云函数、tabBar 性能优化跑通
- 之后：小程序为主，PWA 停止迭代
