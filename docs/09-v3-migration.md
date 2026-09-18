# V2 → V3 / 0.3.0 Migration

V3 增量扩展 V2：保留 AuthProvider / KeycloakAuthProvider、HybridAuthManager、AccessStore、Axios interceptor、Router Guard、v-permission、menu filter 和全部可选 Admin。没有 Local/SSO 两份权限状态。

Authentication source may differ.
Authorization source does not.
Frontend authorization always comes from:
GET /api/rbac/me

## A. New Project Local

```ts
import { createApp } from 'vue'
import { createRbacPlugin, createDjangoLocalProvider } from '@scotec/vue-unified-rbac'
import App from './App.vue'

const rbac = createRbacPlugin({
  auth: { mode: 'local', localProvider: createDjangoLocalProvider() },
})
createApp(App).use(rbac).mount('#app')

// Login submit handler; do not persist form credentials in a store/storage.
await rbac.auth.loginLocal({ username, password })
// Already loaded /api/rbac/me; all consumers share rbac.accessStore.
await rbac.logout()
```

默认创建私有 Pinia 和可信同源 API client；已有 Pinia 的应用请传 `{ pinia, ... }` 并按原方式 `app.use(pinia)`。`rbac.access` 是 `rbac.accessStore` 的同一对象别名。默认 /me loader 自动安装 auth interceptor；传入 `loadAccess` 时完全保留宿主 loader / interceptor 安装策略。

调用链：CSRF → POST Local login → 再取轮换后的 CSRF → source=local → GET /me → 唯一 AccessStore → menu/router/button/Admin。Provider 本身只负责 Authentication，不返回 permissions。单独使用 manager 时没有绑定 Store，认证成功后需要自己调用 loadAccess；Plugin 会自动绑定。

## B. Existing Host Local

已有登录页、验证码、JWT、Cookie/Session、API 和凭据处理全部保留，后端可以关闭 RBAC 默认 Local 登录端点。

```ts
const rbac = createRbacPlugin({ pinia, mode: 'local', loadAccess: fetchMyAccess })
await hostLogin(form)
rbac.auth.setAuthSource('local')
await rbac.accessStore.loadAccess()
// Equivalent convenience API after hostLogin:
// await rbac.auth.notifyLocalAuthenticated()
```

可选适配器，不是强制迁移：

```ts
const localProvider = createHostLocalProvider({
  login: async (credentials: HostCredentials) => { await hostLogin(credentials) },
  logout: async () => { await hostLogout() },
})
const rbac = createRbacPlugin({
  pinia, mode: 'local', localProvider, loadAccess: fetchMyAccess,
})
await rbac.auth.loginLocal(hostCredentials)
```

Host Provider 支持自定义凭据类型；不会调用默认 Django 登录端点，也不会接管宿主 CSRF 策略。原 `hybrid.localLogout` 继续有效；配置 Local Provider 后由 provider.logout 优先负责登出，避免调用两遍。

## C. SSO

纯 SSO V2 consumer 原则上无需修改：

```ts
const rbac = createRbacPlugin({ pinia, auth: keycloakProvider, loadAccess: fetchMyAccess })
installAuthInterceptor(request, rbac.auth)
await rbac.auth.init()
await rbac.accessStore.loadAccess()
```

旧版本的自定义 loader、初始化顺序、显式重登 UX 继续支持。SSO callback 完成后必须 loadAccess；V3 也可用 `await rbac.restoreSession()` 将 init + /me 合为一步。普通 `loginSso()` 仍保持 V2 导航语义，不在跳转前额外加载 /me。

调用链：Keycloak code + PKCE → source=sso → refreshToken → Bearer → /me → AccessStore。不从 Keycloak roles 推导授权。

## D. Hybrid

```ts
const rbac = createRbacPlugin({
  pinia,
  auth: {
    mode: 'hybrid',
    localProvider: createDjangoLocalProvider(), // Or createHostLocalProvider(...)
    sso: createKeycloakProvider(keycloakOptions),
  },
})
// Login page choices:
await rbac.auth.loginLocal({ username, password })
// Or:
await rbac.auth.loginSso()
// After reload/callback:
await rbac.restoreSession()
```

来源由明确选择/恢复标记决定，不根据 token/username/roles 猜测。Hybrid SSO 使用 passive init，不自动导航。无标记时 `restoreSession()` 是宿主显式选择进行 Local Session 探测：初始化 Local CSRF（provider 支持时）后加载 /me。不希望自动探测的登录页不调用该方法；恢复失败回到登录选择，不自动尝试另一种来源。

有效 /me 中 `auth_source` 优先于旧缓存并更新 manager/source storage。保留 V2 `authSource` 和自定义字符串元数据兼容；只有 `local`/`sso` 会同步来源。权限加载过程中及失败后都拒绝访问。切换/登出后的旧 /me 和旧 401 不得污染新会话。

## Session / CSRF / HTTP 配置

已核对本机 drf-unified-rbac V3 `authentication/views.py`、`urls.py` 和 README：

| 默认端点（无尾斜杠） | 契约 |
| --- | --- |
| GET /api/rbac/auth/local/csrf | `{ csrfToken: string }`，同时初始化 Cookie/Session |
| POST /api/rbac/auth/local/login | `{ username, password }` → `{ authenticated: true }` |
| POST /api/rbac/auth/local/logout | CSRF 校验后注销 Session，204 |
| GET /api/rbac/me | `{ username, auth_source, roles, permissions }` |

```ts
const localProvider = createDjangoLocalProvider({
  baseURL: 'https://api.example.com',
  withCredentials: true, // default; configurable
  csrfCookieName: 'csrftoken', // default
  csrfHeaderName: 'X-CSRFToken', // default
  endpoints: {
    csrf: '/api/rbac/auth/local/csrf',
    login: '/api/rbac/auth/local/login',
    logout: '/api/rbac/auth/local/logout',
  },
})
const request = axios.create({ baseURL: 'https://api.example.com' })
const rbac = createRbacPlugin({
  pinia, auth: { mode: 'local', localProvider },
  instance: request, accessEndpoint: '/api/rbac/me',
})
// Default loader installed the interceptor on request; do not install it twice.
```

Django provider 使用独立 auth client，可通过 `instance` 注入；不要在这个 auth client 上安装 SSO 拦截器。它的 defaults 不被修改。跨域须由后端正确配置 CORS credentials、CSRF trusted origins、Cookie SameSite/Secure；Library 不关闭或绕过 CSRF。cookie-only 情况的 Axios `withXSRFToken: true` 仅用于这些明确配置的可信 Local API，不能将该实例用于第三方服务。

每次 login/logout 先取 CSRF，login 后再取一次处理 Django token 轮换。响应体 token 只在 provider 内存中保存，兼容 HttpOnly Cookie 和 CSRF_USE_SESSIONS，并关闭 cookie 自动覆盖，避免跨域时被前端 origin 的无关同名 cookie 替换；cookie-only 响应由 Axios 浏览器传输层读取 csrftoken 自动附加 X-CSRFToken。页面恢复 `init()` 也取新 CSRF，供后续管理写请求使用。没有保存密码或签发 JWT。

Local API 的 interceptor 采用 provider 的 credentials/XSRF 配置；Host Local 不提供该配置时保持原请求不变。SSO 请求不自动启用 credentials/CSRF，仅注入 Bearer。重试旧 config 时会移除 Library 自己曾注入的 Bearer，保留宿主自己的 Authorization。安装/卸载接口仍返回 eject 函数。

如果沿用自定义 `loadAccess`，在它使用的可信 request 上手动 `installAuthInterceptor(request, rbac.auth)`，使 Session/CSRF 也用于 /me 和 Admin 请求。不要同时用旧 raw Keycloak interceptor 和新的 manager interceptor。

## 401、失败与兼容边界

- Local 401：清 access/source，记录 manager.error，调用 Local 错误回调；mode 仍是 local，继续显示 Local 登录。不跳 Keycloak。
- SSO 401/refresh 失败：清 token/access/source，记录错误，调用 SSO 错误回调。不 fallback Local。
- Hybrid 401：仅清当前来源，返回 consumer 的登录选择；不自动切换。
- 403：正常权限/CSRF 错误，不当成 401 自动重登。
- Logout 先撤销前端权限和来源，再调用对应后端；后端失败仍保持前端拒绝，错误抛给宿主。后端会话是否真正结束必须以服务端成功结果为准。
- 并发同一个 Local login 会拒绝第二次；登录中退出/切换会使旧完成失效。客户端不能撤销已经发送的后端 Session 写入，登录 UI 应禁用重复提交和并发注销；本示例已如此处理。

原 public exports、`loadMyAccess`、`loadAccess`、`reloadAccess`、`setAuthSource('local')`、`markLocalAuthenticated`、Admin 均保留。`AuthSource` 新增 null 表达未选择状态，下游 exhaustive 类型逻辑可能需处理 null。`auth` 仍为 V2 的 HybridAuthManager。/me 来源同步属于 V3 的有意行为修正：测试/自定义 loader 应返回真实 auth_source，不能给 SSO 会话固定返回 local。

新增导出：LocalAuthProvider、LocalRequestConfig、LocalLoginCredentials、DjangoLocalProviderOptions、HostLocalProviderOptions、createDjangoLocalProvider、createHostLocalProvider、RbacAuthOptions。新增 manager.loginLocal / notifyLocalAuthenticated / error，以及 plugin.restoreSession / access。不要求现有项目迁移到默认 Local Provider。

## Demo

保留原 SSO demo，默认启动方式不变。启用独立 V3 consumer 页面：

```powershell
$env:VITE_RBAC_V3 = 'true'
$env:VITE_RBAC_MODE = 'local' # or sso / hybrid
npm run dev
```

`src/demo/v3/bootstrap.ts` 的 createDemoRbac 展示三种配置；AuthDemo 提供 Local 表单、SSO Login、Logout、/me 刷新和权限按钮。密码仅取自提交时的表单并立即清空输入。默认 `/api` 走现有 Vite proxy；跨域可设置 VITE_RBAC_API_ORIGIN（只填 origin，不重复 /api 前缀）。生产 demo build 使用同样的环境变量。生产部署需同源反代或正确的跨域配置。
