# RBAC V1 SSO 测试

## 环境准备

1. 使用 Node.js >= 22.18.0（与 `.nvmrc` / `package.json` 一致），执行 `npm install`、`npm run dev`。
2. 启动已有 DRF 服务 `http://127.0.0.1:8000`。Vite 的 `/api` 代理已指向该地址。
3. 确认本机可解析 `sso.idm.internal`，浏览器信任 `https://sso.idm.internal:9443` 的证书。
4. 核对 `.env.development`：

   ```dotenv
   VITE_API_BASE_URL=/api
   VITE_KEYCLOAK_URL=https://sso.idm.internal:9443
   VITE_KEYCLOAK_REALM=ops
   VITE_KEYCLOAK_CLIENT_ID=rbac-demo
   ```

5. 在 Keycloak 的 `ops` realm 核对 `rbac-demo` 客户端设置（由环境管理员配置）：
   - Client authentication：Off（公共 SPA 客户端，无 client secret）。
   - Standard flow：On；使用 Authorization Code Flow + PKCE S256。
   - Implicit flow、Direct access grants：Off。
   - Valid redirect URIs：`http://127.0.0.1:8080/*`。
   - Valid post logout redirect URIs：`http://127.0.0.1:8080` 和 `http://127.0.0.1:8080/*`。
   - Web origins：`http://127.0.0.1:8080`。
6. 准备不同授权的测试账号，权限由 DRF `/api/rbac/me` 返回；角色名本身不产生前端授权。

`VITE_KEYCLOAK_URL` 不含 `/realms/ops`。配置依据：[Keycloak 官方 JavaScript adapter 文档](https://www.keycloak.org/securing-apps/javascript-adapter)。

`npm run build` 使用 production 模式，不读取 `.env.development`。部署前在 `.env.production.local` 或构建环境设置以上四个变量（按目标环境调整），部署服务器需支持 SPA history fallback 和 `/api` 反向代理；Vite 开发代理不会打包到生产产物。缺少 Keycloak 配置时应用显示启动错误与重新加载入口。

## 测试 1：首次访问

清理浏览器站点状态或打开无痕窗口，访问 `http://127.0.0.1:8080`。

期望自动跳到 `https://sso.idm.internal:9443/realms/ops/...` 的 Keycloak 登录页面。授权请求中 `client_id=rbac-demo`、`response_type=code`、`code_challenge_method=S256`；不要执行任何手工 Token 设置。

## 测试 2：Keycloak 登录

在 Keycloak 页面输入测试账号并完成登录。

期望回到 `http://127.0.0.1:8080`，页面正常显示；Keycloak SDK 完成 code 交换并清理回调参数后，才创建 Router、挂载 Vue。直接访问受保护路径时，登录回跳应保留该路径。

## 测试 3：Network

F12 → Network，找到 `GET /api/rbac/me`。

期望 Request Headers 包含 `Authorization: Bearer eyJ...`，Status 为 `200`，响应符合现有接口约定：

```json
{
  "username": "测试账号",
  "auth_source": "sso",
  "roles": ["示例角色"],
  "permissions": ["demo.order.view"]
}
```

菜单、Router、按钮只检查 `permissions`。不要把完整 Token 或含 Token 的 Network 导出文件提交到仓库。

## 测试 4：admin 权限

使用后端返回以下四个权限的账号：

```text
demo.order.view
demo.order.create
demo.order.approve
demo.order.delete
```

期望订单菜单显示，`/release/orders` 可访问，创建、审批、删除按钮均显示。现有按钮仍是禁用的权限演示按钮，本次不接业务写接口；名为 admin 的角色不自动获得任何权限。

## 测试 5：viewer 权限

通过 Logout 切换到仅有 `demo.order.view` 的账号。

期望订单菜单显示、订单页允许访问，创建、审批、删除按钮隐藏。

## 测试 6：无 view 权限

使用不含 `demo.order.view` 的账号。

期望订单菜单隐藏。直接访问 `http://127.0.0.1:8080/release/orders` 后进入 `/403`。`/403` 没有 `permission`，守卫不会继续加载权限或再次跳转；首页和“我的权限”也没有业务权限要求。

## 测试 7：刷新页面与重复导航

登录后按 F5。期望重新初始化 Keycloak，现有 SSO session 有效时完成回跳，重新请求一次 `/api/rbac/me` 并正常显示。

同一次 Vue 运行期间，在首页、订单页、“我的权限”之间来回导航，不应反复请求 `/api/rbac/me`。Store 现有 `pendingLoad` 合并并发加载，`loaded` 防止导航重复加载；`loaded` 表示加载已经结束，失败状态由 `error` 表示。刷新页面、显式 `loadMyAccess()` 或失败页的“重新加载权限”才触发新请求。

期望无白屏、无限 redirect 或认证错误误跳 `/403`。权限加载失败时显示错误；加载失败不等于已经确认用户没有页面权限。

## 测试 8：Token Refresh

在测试环境缩短 Access Token Lifespan，或等待当前 Token 剩余不足 30 秒。在 DevTools Sources 中给 `src/auth/keycloak.ts` 的 `keycloak.updateToken(30)` 加断点，然后通过“我的权限”页触发：

```js
// 仅开发环境用于触发已有 Store 的显式重载，不读取或注入 Token。
const { useAccessStore } = await import('/src/stores/access.ts')
await useAccessStore().loadMyAccess()
```

期望每次 API 请求前先调用 `updateToken(30)`。Token 足够新时无需网络刷新；临近过期时先请求 Keycloak token endpoint，刷新成功后 `/api/rbac/me` 使用新 Access Token，业务请求继续成功。

Application → Local Storage / Session Storage 中不能出现应用保存的 Access / Refresh / ID Token。应用仅使用 `sessionStorage` 保存 `rbac.sso.relogin-attempted=1` 这一非敏感防循环标记；官方 SDK 可能临时保存 OIDC state / nonce / PKCE 回调校验数据，这不属于 Token 持久化。

## 测试 9：Logout

点击侧栏 Logout。期望浏览器访问 Keycloak logout endpoint，服务端 SSO session 被注销，回到 `http://127.0.0.1:8080` 后由于 `login-required` 重新出现登录页。

退出时清空当前 AccessStore，防止旧账号权限残留；实际注销由 `keycloak.logout({ redirectUri: window.location.origin })` 完成。再次登录其他账号后应只显示新账号的权限。

## 异常回归：401 / 403 / 初始化失败

- **持续 401**：在测试代理或接口拦截环境让 `/api/rbac/me` 持续返回 401。首次失败最多自动重登一次，并强制显示登录表单；回跳后仍失败则停止自动跳转，展示“登录状态异常”和“重新登录”按钮，不进入 `/403`。
- **刷新失败**：在测试环境注销 Keycloak session，等待 Access Token 接近过期后触发权限重载。刷新失败时业务请求不能携带旧 Token 继续发送，应走同一重登流程。SDK 初始化后关闭其 `clearToken()` 隐式自动登录，避免绕过重登标记。
- **并发 401**：同时触发多个失败请求，只能发起一次登录跳转。内存标记防并发，标签页会话标记跨整页回跳保留。
- **重登标记的生命周期**：每个标签页在两次 Logout 之间最多自动重登一次。成功初始化或 `/api/rbac/me` 返回 200 都不清除标记，避免“me 成功、其他业务接口持续 401”也形成循环；后续认证失败可主动点击“重新登录”，Logout 会清除标记。F5 不清除标记。浏览器拒绝访问会话存储时，停止自动重登并保留主动登录入口。
- **业务 API 403**：模拟任一业务 API 返回 403，应原样拒绝请求且不重登、不全局跳路由；调用方处理业务错误。`/api/rbac/me` 若返回 403，显示权限加载失败，可显式重试。
- **网络断开 / 500**：权限接口失败后不放行受保护页面、不重新登录，展示可重试的权限加载错误。恢复接口后点击“重新加载权限”可以恢复菜单与权限。
- **初始化失败**：移除构建环境的 Keycloak 配置，或让初始化期间的 code 交换失败，应显示启动错误与“重新加载”按钮，无白屏、无自动重试循环。若首次顶层跳转被 SSO 证书或网络错误阻断，浏览器会显示自身的证书 / 连接错误，需先修复环境。

## 工程检查

```bash
npm install
npm run type-check
npm run test:sso
npm run build
git diff --check
```

如项目存在 lint script 再运行 `npm run lint`；当前项目没有该脚本。真实账号登录、内网 SSO 配置、证书与 DRF 返回值须按以上步骤在联调环境验收，构建通过不能代替这些人工测试。

`npm run test:sso` 使用 Node 内置测试工具和现有 TypeScript 依赖，无新增认证或测试框架。测试替换 Keycloak 与网络响应，执行真实认证模块、Axios、AccessStore 和 Router；Node 的 VM Modules 实验性提示仅来自测试运行器，不影响应用运行。

## 本次验证记录（2026-09-12）

- 使用 Node.js 24.19.0 完成 `npm install`、`npm run type-check`、`npm run build`，均通过；`npm install` 审计报告 0 vulnerabilities。
- `npm run test:sso`：14 项通过，覆盖初始化、刷新顺序、并发 401、跨回跳防循环、存储受限、403 区分、权限缓存、无 view 拒绝、错误重试与 Logout。
- 临时 Edge 浏览器检查（替换 SDK / 后端）：admin、viewer、无 view、持续 401、me 403 重试、初始化失败，共 6 组通过；包含实际菜单 / 按钮 DOM、路由、F5 和 Logout 入口。
- 真实 SSO 首次访问：已发起到 `ops` 登录端点的跳转。这台机器的新浏览器上下文报 `ERR_CERT_AUTHORITY_INVALID`；仅在临时诊断上下文忽略证书错误后，确认真实 `Sign in to ops` 页面和登录表单可访问，参数为 `client_id=rbac-demo`、`response_type=code`、`code_challenge_method=S256`。应用未关闭证书校验，正常联调前须信任内网 CA。
- 未使用真实测试账号完成登录，因此真实 DRF `/api/rbac/me` 的 200、账号权限、Token 刷新及服务端 Logout 仍需按上述 9 项人工验收。
