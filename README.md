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
- Keycloak SSO 登录、内存 Token、请求前刷新与 SSO Logout

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

打开 `http://127.0.0.1:8080` 后自动进入 Keycloak 登录。`.env.development` 已配置 SSO 地址、realm `ops`、client `rbac-demo`；Vite 将 `/api` 代理到 `http://127.0.0.1:8000`。需要本机能够访问 SSO 并信任其 HTTPS 证书，且 DRF 已启动。

登录成功后先初始化 Pinia、加载一次 `GET /api/rbac/me`，再创建 Router 并挂载 Vue。权限仅存于 AccessStore；静态菜单、路由和指令继续使用 `hasPermission()`。

Token 由 `src/auth/keycloak.ts` 中的 `keycloak-js` 实例在内存中管理。Axios 在每次请求前调用 `updateToken(30)`，再从 `keycloak.token` 设置 Bearer 头，无需手工输入 Token。401 最多自动重登一次，随后显示可手动重试的认证错误；403 不触发登录。

完整配置、9 项人工验收和异常回归方法见 [SSO V1 测试文档](docs/06-sso-test.md)。生产构建需要在 `.env.production.local` 或构建环境提供同样的 `VITE_*` 配置，并由部署服务器转发 `/api`。

发布单按钮只演示按权限显示，暂时保持禁用，不调用业务接口。真正的业务权限仍由后端校验。

## 首先阅读

```text
docs/01-pseudocode.md
docs/02-permission-convention.md
docs/04-learning-steps.md
```
