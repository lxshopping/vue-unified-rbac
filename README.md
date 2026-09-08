# vue-unified-rbac

Vue 3 RBAC 前端学习/复用骨架。

当前阶段刻意只做：

- 静态菜单
- 静态路由
- 我的权限只读页面，其余 RBAC 管理页面保持空壳
- `/api/rbac/me` 数据模型
- AccessStore 加载权限与 default deny
- 菜单、路由和发布单按钮权限判断
- Permission Code 命名规则

**没有实现完整 RBAC。** 这是为了按“先理解伪代码 → 自己补核心 → Codex 实现 → 修改 → 重写 → Review”的方式学习。

## 本地建议初始化

Vue 官方当前推荐使用 `create-vue`（Vite）创建项目，并可直接选择 TypeScript、Vue Router、Pinia。

如果你要在本机从官方脚手架重新生成：

```bash
cd /mnt/e/code
npm create vue@latest
```

项目选择建议：

```text
Project name: vue-unified-rbac
TypeScript: Yes
JSX: No
Vue Router: Yes
Pinia: Yes
Vitest: No（第一步先不加）
E2E: No
ESLint: Yes
Prettier: Yes
DevTools: No
```

然后把本骨架 `src/` 与 `docs/` 的设计迁入即可。

## 当前骨架直接运行

依赖安装成功后：

```bash
npm install
npm run dev
```

普通页面首次导航会请求同源 `GET /api/rbac/me`。运行环境需将 `/api` 转发到真实后端；当前未配置后端地址或 Vite 代理。如果只启动前端，接口不可用时会拒绝所有受保护权限，公共页面仍可访问，“我的权限”会显示加载失败。

学习阶段，在浏览器开发者工具 Console 中设置自己的有效 access token 后刷新：

```js
sessionStorage.setItem('access_token', '替换为自己的有效 Token')
location.reload()
```

`src/api/rbac.ts` 的 `getAccessToken()` 是唯一 Token 来源入口，后续接入登录时替换此函数即可。未设置 Token 时不发送 Authorization 头；前端不会解析 Token 或根据角色补权限。更换 Token 或后端权限后刷新页面以重新加载。

发布单按钮只演示按权限显示，暂时保持禁用，不调用业务接口。真正的业务权限仍由后端校验。

## 首先阅读

```text
docs/01-pseudocode.md
docs/02-permission-convention.md
docs/04-learning-steps.md
```
