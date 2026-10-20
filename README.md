> **0.3.4**：新增可选审计页面（`includeAudit: true` / `rbac.audit.view`）、危险操作确认和后端保护错误提示。旧公开调用保留。详见 [接入与升级](docs/11-admin-ui.md#034-审计与危险操作保护) 和 [修改总结](docs/13-v034-report.md)。

> **V3 / 0.3.0**：新增默认 Django Session Local Provider 和可选 Host Local Adapter，保留 V2 SSO、Hybrid 和 Admin。四种接入场景、CSRF 配置、可运行 Demo 及兼容说明见 [V2 → V3 Migration](docs/09-v3-migration.md)。
>
> Authentication source may differ. Authorization source does not.
> Frontend authorization always comes from: GET /api/rbac/me.

```ts
const rbac = createRbacPlugin({
  auth: { mode: 'local', localProvider: createDjangoLocalProvider() },
})
app.use(rbac)
await rbac.auth.loginLocal({ username, password }) // automatically loads /me
```

已有宿主继续 `hostLogin() → setAuthSource('local') → loadAccess()`，无需替换登录系统。下文 V2 接口继续有效，V3 扩展以迁移指南为准。

# @scotec/vue-unified-rbac

Vue 3 通用 RBAC Plugin / Library。认证通过 AuthProvider 接入，权限由宿主的 loadAccess 返回。角色仅展示，授权只匹配 permissions，不存在 admin 特权或内置业务 Permission Code。

这是从已验证的 Keycloak SSO Demo 提取的前端 Library；src/demo 是 Library Consumer Example。前端控制页面、菜单和按钮，业务请求的最终授权仍由后端完成。

## 安装

发布到 npm registry 后，宿主执行：

~~~bash
npm install @scotec/vue-unified-rbac
~~~

本次改造只准备可安装的包，尚未执行 npm publish。发布前可本地验证：

~~~bash
npm install
npm run build
npm pack
# 在另一个 Vue 项目中：
npm install /path/to/scotec-vue-unified-rbac-0.3.4.tgz
~~~

宿主依赖：Vue ^3.5.0、Pinia ^3.0.0、Vue Router ^4.5.0、Axios ^1.20.0。使用 ESM 与 TypeScript moduleResolution: "Bundler"。本仓库开发/构建要求 Node.js >=22.18.0。

## SSO-only Consumer Example（0.1.x 用法继续支持）

以下 release.* 全部是**宿主业务应用定义的示例**，Library 不注册、不生成这些权限，也不要求采用特定命名方式。

### main.ts

~~~ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import {
  createKeycloakProvider,
  createRbacPlugin,
  installAuthInterceptor,
  installRbacGuard,
  type AccessResult,
} from '@scotec/vue-unified-rbac'
import App from './App.vue'
import request from './api/request' // 宿主已有 AxiosInstance

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)

  const auth = createKeycloakProvider({
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: import.meta.env.VITE_KEYCLOAK_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
    logoutOptions: { redirectUri: window.location.origin },
  })
  await auth.init()

  const ejectAuth = installAuthInterceptor(request, auth)
  const rbac = createRbacPlugin({
    pinia,
    auth,
    loadAccess: async (): Promise<AccessResult> => {
      const response = await request.get<AccessResult>('/rbac/me') // 此 request 的 baseURL 为 /api
      return response.data
    },
  })
  app.use(rbac)

  // 可选：公共首页也需要显示权限菜单时，主动预加载。
  // 失败会清空权限并记录 error；宿主可展示错误/重试 UI。
  try {
    await rbac.accessStore.loadMyAccess()
  } catch {
    // 不将请求对象或 Token 输出到日志。
  }

  // Keycloak 清理回调 URL 后才创建 Web History / Router。
  const { default: router } = await import('./router')
  const removeGuard = installRbacGuard(router, {
    accessStore: rbac.accessStore,
    permissionMetaKey: 'permission',
    forbiddenRoute: '/403',
    // 可选 accessErrorRoute: '/access-error'（须由宿主定义公共页面）
  })

  app.use(router)
  await router.isReady()
  app.mount('#app')

  // ejectAuth() / removeGuard() 可用于宿主显式拆卸。
  // app.use(rbac) 不会自动修改 Router 或 Axios。
  return { rbac, ejectAuth, removeGuard }
}

void bootstrap().catch(() => {
  const root = document.querySelector('#app')
  if (root) root.textContent = '应用初始化失败，请检查认证配置后重新加载。'
})
~~~

只有宿主创建 Pinia。必须显式将同一个 pinia 传入 createRbacPlugin；每个 Pinia 配置一次，多应用使用各自的 Pinia。插件创建时建立 Store，安装时注册 v-permission 和 provide 上下文。插件不自动 init 登录、请求权限、创建路由或创建 AxiosInstance。

### router.ts — Consumer Example

~~~ts
import { createRouter, createWebHistory } from 'vue-router'
import Home from './views/Home.vue'
import Orders from './views/Orders.vue'
import Forbidden from './views/Forbidden.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    {
      path: '/orders',
      component: Orders,
      meta: { permission: 'release.order.view' },
    },
    { path: '/403', component: Forbidden },
  ],
})
~~~

### 组件、菜单与 JS — Consumer Example

~~~vue
<script setup lang="ts">
import { computed } from 'vue'
import { useAccessStore, useRbac, filterMenus } from '@scotec/vue-unified-rbac'

const accessStore = useAccessStore()
const rbac = useRbac()
const canApprove = computed(() => accessStore.hasPermission('release.order.approve'))
const menus = [
  { title: '首页', path: '/' },
  { title: '订单', path: '/orders', permission: 'release.order.view' },
]
const visibleMenus = computed(() => filterMenus(menus, accessStore.hasPermission))

async function logout() {
  await rbac.logout()
}
</script>

<template>
  <button v-permission="'release.order.approve'">审批</button>
  <button @click="logout">Logout</button>
</template>
~~~

useAccessStore() 在组件 setup / app.runWithContext 中使用宿主 Pinia。在组件外、异步回调或多应用场景中，直接使用 rbac.accessStore 或 useAccessStore(pinia)，避免依赖全局 active Pinia。useRbac() 用于 setup 或 app.runWithContext。

## Authentication Provider

~~~ts
interface AuthProvider {
  init(): Promise<void>
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  getAccessToken(): string | undefined
  refreshToken(minValidity?: number): Promise<boolean>
}
~~~

自定义 Provider 实现此接口即可，AccessStore、Axios 拦截器和 Plugin 不导入 keycloak-js。认证与业务授权分开；不要从 Token roles 推导前端权限。

createKeycloakProvider(options) 返回 KeycloakAuthProvider：
- 每个 Provider 有独立 SDK 实例，init() 合并重复调用；初始化失败后重新加载宿主页面重试。
- 默认 onLoad: 'login-required'、checkLoginIframe: false。
- 固定 flow: 'standard' 与 pkceMethod: 'S256'，initOptions 无法关闭或替换它们。
- 可传 initOptions、loginOptions、logoutOptions；Library 不读取 import.meta.env 或具体服务地址。
- refreshToken(minValidity = 30) 委托 SDK updateToken。
- 初始化后关闭 SDK clearToken() 的隐式自动登录，运行期登录恢复由宿主决定。
- clearToken() 是 Keycloak Provider 特有方法，供宿主处理被服务端拒绝的会话；不是 AuthProvider 的必需接口。

Token 仅由 keycloak-js 在内存管理。Library 没有 sessionStorage/localStorage Token 持久化；SDK 的 OIDC state / nonce / PKCE 回调临时数据不是 Token 存储。参考 [Keycloak JavaScript adapter](https://www.keycloak.org/securing-apps/javascript-adapter)。

## Axios 安装与错误策略

~~~ts
const eject = installAuthInterceptor(request, auth, {
  minValidity: 30,
  onAuthError: async () => {
    // 可选：宿主先 clearAccess，再显示认证错误或执行有上限的登录恢复。
  },
})
~~~

流程：确认已认证 → await refreshToken → getAccessToken → 设置 Authorization: Bearer。刷新失败、未认证或 Token 缺失都会阻止请求；即使 onAuthError 正常返回也不会继续发送。

传入原始 AuthProvider 时保留 request-only 行为（除非显式传入 accessStore / onLocalAuthError）；传入 rbac.auth 协调器时同时安装按会话分流的 401 response interceptor。不更改 baseURL、timeout 或其他 headers，返回函数移除本次注册的拦截器。只安装在宿主受信任 API 的实例上。

旧 SSO 示例中，401/403 HTTP 响应继续由宿主原有 response interceptor 处理。Hybrid 接入应移除该实例上无条件跳转 Keycloak 的旧 401 处理，改用下方分流回调。Library 不自动无限重登；Demo 保留“每标签页两次 Logout 之间最多自动重登一次”的旧策略。其 sessionStorage 仅保存非 Token 标记 rbac.sso.relogin-attempted。

## AccessResult 与 AccessStore

~~~ts
interface AccessResult {
  username?: string
  auth_source?: string
  authSource?: string // 兼容已有 camelCase 转换
  roles: string[]
  permissions: string[]
}
~~~

loadAccess 决定 API 地址、Axios 实例、响应 envelope 与字段适配。Store 会运行时验证完整 roles/permissions 数组并复制数据；格式异常拒绝整份响应。auth_source/authSource 是展示信息，可为任意字符串，不限制认证服务。

Store 暴露：
- me、username、authSource、roles、permissions、loaded、loading、error。
- loadAccess() / loadMyAccess()：同一方法的两个名称；显式加载，合并并发请求；调用已结束后再次调用会重新加载。
- reloadAccess()：清空状态，使已有请求失效，再开始新加载。
- clearAccess() / reset()：清空权限并使尚未完成的旧请求失效。
- hasPermission(code)、hasAnyPermission(codes)、hasAllPermissions(codes)。

保留原语义：loaded 表示当前加载尝试已结束，包含失败；error/me 区分失败与成功。导航守卫不会自动反复重试失败请求，宿主可以调用 reloadAccess()。

未加载、加载中、失败、未认证、空字符串或非法参数均拒绝。空数组 hasAllPermissions([]) / hasAnyPermission([]) 返回 false。只检查 permissions.includes(code)，不读取 role 名称授予特权。

## Router Guard

~~~ts
const removeGuard = installRbacGuard(router, {
  accessStore: rbac.accessStore,
  permissionMetaKey: 'permission', // 默认
  forbiddenRoute: '/403',        // 默认；也可传命名路由
  accessErrorRoute: '/access-error', // 可选
})
~~~

没有指定 meta key 的路由直接放行；有 key 时等待权限加载，然后判断字符串权限。显式 undefined、空字符串、数组等非法 permission 均拒绝。菜单和守卫都区分“缺省 permission”与“非法 permission”。

缺少权限去 forbiddenRoute。权限加载异常默认也拒绝并去 forbiddenRoute；宿主可以通过 accessErrorRoute 展示独立错误页。Demo 设为 '/' 保留原有认证/权限加载失败提示。

错误页应是公共路由。如果错误页误配成受保护路由，守卫在跳转目标与当前记录相同时取消导航，防止 /403 自循环，也不会为了消除循环而豁免它的权限。守卫不定义业务路由、不解释 requiresAuth，不触发登录。

## v-permission 与 Menu Filter

app.use(rbac) 注册 v-permission。只支持单个字符串；数组未定义语义，按非法输入隐藏。沿用原有 comment placeholder + watchEffect，实现异步加载、权限清空、绑定值更新时的响应式隐藏/恢复，卸载时释放 watcher。

filterMenus(menus, hasPermission) 是纯函数：不依赖 Store、Router 或业务配置，保留宿主字段，递归过滤 children，不修改输入。无 permission 默认显示；空父菜单被移除。有 permission 时调用宿主传入的检查函数。

## Logout

可直接调用标准 Provider API：

~~~ts
accessStore.clearAccess()
await auth.logout()
~~~

也可使用 rbac.logout() / useRbac().logout()，它在委托 auth.logout() 前清空权限，即使登出失败也不保留之前的授权。Library 不修改宿主原始 Provider；rbac.auth 是新增协调器，调用它的 logout() 会清空权限与来源，并按来源登出。直接调用原始 Provider 时宿主仍负责 clearAccess。Demo 的 Logout 同时清除其非敏感重登标记。

## 0.1.x 公共导出（全部保留）

公共源码入口是 src/lib/index.ts；宿主只从包根导入，禁止深层导入 src/lib 或 Demo。

| 分类 | 公开 API |
| --- | --- |
| 认证 | createKeycloakProvider、KeycloakAuthProvider、AuthenticationError |
| 插件/上下文 | createRbacPlugin、useRbac |
| 权限 | useAccessStore |
| 集成 | installAuthInterceptor、installRbacGuard、filterMenus |
| 类型 | AuthProvider、KeycloakProviderOptions、AccessResult、AccessLoader、AccessStore |
| 类型 | RbacOptions、RbacPluginOptions、RbacPlugin、RbacContext |
| 类型 | RouterGuardOptions、AuthInterceptorOptions、PermissionMenuItem |

## 源码与发布边界

~~~text
src/
  lib/
    auth/            # AuthProvider + Keycloak 实现
    access/          # Store 与 AccessResult
    axios/           # 宿主 Axios 拦截器
    router/          # 独立安装的权限守卫
    directives/      # v-permission 工厂
    menu/            # 纯菜单过滤函数
    admin/           # 可选 Admin API / context / 原生 Vue TS views / lazy routes
    plugin.ts
    types.ts
    index.ts         # 唯一公共入口
  demo/
    auth/            # env、错误提示、401 有界恢复
    api/             # 宿主 Axios 实例、/rbac/me 地址
    config/          # Demo 权限码与静态菜单
    router/          # Demo 路由与认证错误恢复
    layouts/
    views/           # 原有宿主示例；Library Admin 位于 src/lib/admin
    main.ts
    App.vue
    style.css
tests/               # Node 内置测试，不发布
docs/                # Demo 联调与迁移记录，不发布
dist/                # Library JS + declarations
demo-dist/           # Demo 静态应用，不发布
~~~

Vite Library Mode：入口 src/lib/index.ts、name VueUnifiedRbac、ESM 输出 dist/index.js。TypeScript tsc 单独生成 dist/index.d.ts 及其引用的声明，不引入额外声明打包框架。参考 [Vite Library Mode](https://vite.dev/guide/build.html#library-mode)；本项目使用 Vite 7 的 rollupOptions.external。

package.json 的 main/module 指向 dist/index.js，types 指向 dist/index.d.ts；exports 只声明 "." 的 types/import；files 仅允许 dist 与 README.md（npm 自带 package.json 元数据）。这是 ESM 包，未提供 require/UMD 入口。

vue、pinia、vue-router、axios 为 peerDependencies，同时在 devDependencies 中用于本仓库 Demo 与测试。keycloak-js 为 dependency，随包安装默认 Provider 所需 SDK；不要求宿主额外手动安装。五者全部 external，不打入 Library，避免重复打包 Vue/Pinia/Router 或 SDK。

## 本仓库开发与验证

~~~bash
npm install
npm run dev          # 默认 127.0.0.1:8080，运行 src/demo
npm run type-check
npm test
npm run test:sso     # 现有 14 项 SSO 回归
npm run build        # 全项目类型检查 + Library
npm run build:lib    # Library + 类型声明
npm run build:demo   # Demo -> demo-dist
npm run preview     # 预览 demo-dist
git diff --check
npm pack --dry-run
~~~

dev 使用 .env.development。原有 Keycloak realm/client、Demo 权限码、Vite /api 开发代理保持在宿主配置中。修改 Vite 配置后需要重启旧开发服务；尤其是跨文件系统运行的服务，不能假定配置监听生效。

build:demo 使用 demo mode，请通过构建环境变量或 .env.demo.local 提供四个 VITE_* 配置。生产部署还需 SPA history fallback 与 /api 转发；开发 proxy 不进入生产包。Library 构建不依赖这些配置。

真实 SSO、/api/rbac/me 与 Logout 的人工检查见 [Demo SSO 联调](docs/06-sso-test.md)，结构迁移说明见 [Library 改造记录](docs/07-library-refactor.md)。离线自动测试替换 SDK/网络，不能代替真实账号和服务端会话验收。

## 0.2.0：Hybrid Authentication

`AuthMode = 'local' | 'sso' | 'hybrid'` 表示系统支持的登录方式；`AuthSource = 'local' | 'sso'` 表示当前会话来源，尚未选择/登出后为 `null`。两种认证始终进入同一个 `/api/rbac/me` 与 AccessStore，不从 Keycloak roles 生成授权。

```text
Local: Host Login → setAuthSource('local') ───────────────┐
                                                        ↓
                                                   /api/rbac/me
                                                        ↓
SSO: SSO Button → Keycloak → callback → Bearer ───────→ AccessStore
                                                        ↓
                                       Menu / Router / v-permission / Admin
```

`HybridAuthManager` 组合原始 Provider，兼容 AuthProvider 方法，并提供：

- `mode` / `getMode()`、响应式 `source` / `getAuthSource()`。
- `setAuthSource()`、`markLocalAuthenticated()`、`clearAuthSource()`、`restoreAuthSource()`。
- `isLocal()`、`isSso()`、`loginSso()`、`logout()`、`init()`。
- 默认仅将来源标记写入 `sessionStorage['scotec.rbac.auth_source']`；可配置 storageKey 或注入 Storage，`storage: null` 禁用持久化。不保存密码或 Token，不使用 localStorage。

构造时恢复来源；Local/未选择来源时 `init()` 不碰 Keycloak。Hybrid SSO 使用 `initPassive()`，处理回调但不设置 `onLoad`，即不主动执行 login-required 或 check-sso 跳转。只有显式 `loginSso()` 才调用登录。纯 SSO 默认保留 login-required。自定义 Hybrid SSO Provider 必须实现不会跳转的 `initPassive()`，否则明确拒绝初始化。

来源标记只是认证流程提示，不是权限凭据。Local 登录成功/已由宿主确认会话后才设置 local，最终由携带宿主凭据的 `/me` 验证。可提供 `isLocalAuthenticated` 读取宿主响应式会话状态。storage 被浏览器禁用时仅保留内存状态；刷新不能恢复，尤其 SSO 回调必须由宿主在确认回调上下文后恢复来源，Library 不猜测登录来源、不自动循环重登。

### Local-only

保留宿主登录表单、登录 API、cookie/session/token、CSRF 配置及原有请求拦截器：

```ts
const rbac = createRbacPlugin({
  pinia,
  mode: 'local', // 不需要 Keycloak / AuthProvider
  loadAccess: async () => (await request.get('/api/rbac/me')).data,
  hybrid: {
    localLogout: () => existingLocalLogout(),
    onLocalAuthError: () => showLocalSessionExpired(),
  },
})
app.use(rbac)
installAuthInterceptor(request, rbac.auth)

// 宿主原有登录表单：
await existingLocalLogin()
rbac.auth.markLocalAuthenticated()
await rbac.accessStore.loadAccess()
```

此示例的 request 无 `/api` baseURL；如果已有 baseURL 为 `/api`，路径用 `/rbac/me`，避免重复 `/api`。Library 不添加 Local Bearer，不读取 Local 密码，也不实现 Local Login API。

### Hybrid 完整初始化

```ts
import { createPinia } from 'pinia'
import {
  createKeycloakProvider, createRbacPlugin,
  installAuthInterceptor, installRbacGuard,
  type AccessResult,
} from '@scotec/vue-unified-rbac'

const pinia = createPinia()
app.use(pinia)
const sso = createKeycloakProvider({
  url: hostConfig.ssoUrl,
  realm: hostConfig.realm,
  clientId: hostConfig.clientId,
  logoutOptions: { redirectUri: window.location.origin },
})
const rbac = createRbacPlugin({
  pinia,
  auth: sso,
  mode: 'hybrid',
  hybrid: {
    localLogout: () => existingLocalLogout(),
    onLocalAuthError: () => showLocalSessionExpired(),
    onAuthError: () => showSsoSessionExpired(),
  },
  loadAccess: async (): Promise<AccessResult> =>
    (await request.get<AccessResult>('/api/rbac/me')).data,
})
app.use(rbac)
const eject = installAuthInterceptor(request, rbac.auth)
await rbac.auth.init() // 不要在 Hybrid 中先调用 sso.init()

// Keycloak 完成回调 URL 清理后再创建 Router。
const { default: router } = await import('./router')
installRbacGuard(router, { accessStore: rbac.accessStore, forbiddenRoute: '/403' })
app.use(router)
await router.isReady()
app.mount('#app')
```

插件安装不会请求 `/me`，不会安装 Router/Axios，也不添加管理路由。权限路由由已有 guard 按需加载 `/me`；公共 `/login` 不加载。若公共首页也需要菜单，可由宿主在确认 `rbac.auth.isAuthenticated()` 且当前不在 `/login` 后主动预加载。不要给登录页或错误页配置受保护 permission；guard 不负责跳转登录。

SSO callback 必须由宿主配置有效 redirectUri 返回应用；刷新后先恢复 source、再 `await rbac.auth.init()`，然后进入上述按需加载流程。Local 刷新完全不初始化 Keycloak。

### 发布系统登录页

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useRbac } from '@scotec/vue-unified-rbac'
import { existingLocalLogin } from '@/auth/local' // 发布系统已有实现

const router = useRouter()
const rbac = useRbac()
async function loginLocal() {
  await existingLocalLogin() // 保留原表单校验与凭据处理
  rbac.auth.setAuthSource('local')
  await rbac.accessStore.loadAccess()
  await router.push('/')
}
async function loginSso() {
  await rbac.auth.loginSso()
}
</script>
<template>
  <!-- 这里继续使用发布系统已有的用户名密码表单，提交时调用 loginLocal。 -->
  <button type="button" @click="loginSso">SSO 登录</button>
</template>
```

`loginSso()` 在跳转前保存 source；不要在 Keycloak 导航 Promise 后无条件调用 `/me`，回调回到应用时由 bootstrap / guard 加载。宿主负责把登录错误展示在现有表单上。

### 401、会话切换与 Logout

向 `installAuthInterceptor` 传 **`rbac.auth`** 才启用 Hybrid 分流：

| 当前请求来源 | 请求 | 401 / 认证失败 |
| --- | --- | --- |
| local | 完整保留宿主凭据 | 清空 AccessStore/source，调用 onLocalAuthError |
| sso | refreshToken → getAccessToken → Bearer | clearToken、清空 AccessStore/source，调用 onAuthError |
| null | 不注入 SSO Token | 交宿主处理（例如登录 API 自身的 401） |

任何分支都不会自动 Keycloak login。403 继续交业务处理。回调可配置在 `hybrid` 或 interceptor options；避免同时配置同一恢复动作。原始 Provider 的 interceptor 用法保持兼容；新建 Hybrid consumer 不要同时保留旧无条件 401 → Keycloak 回调。

每次重新标记来源、清空来源或登出都会使旧 `/me` 失效；SSO refresh 期间切换会话会取消该请求，旧会话迟到的 401 不会注销新会话。`rbac.logout()` 与 `rbac.auth.logout()` 都先清空权限/source：Local 调宿主 localLogout，SSO 调 Provider logout 并清理 Token，即使失败也不恢复权限。

## Optional RBAC Admin UI

Admin 独立位于 `src/lib/admin`，没有 UI 框架依赖，使用 Vue 3 原生 render 组件（`.ts`）与原生表格/checkbox。导出的页面和路由均按需加载；核心插件不安装 Admin、不请求 Admin API、不修改菜单。宿主可通过 `.rbac-admin`、`.rbac-admin-table`、`.rbac-admin-matrix` 设置主题。

页面只依赖 `RbacAdminApi`，不会直接调用 axios：

| 页面 | 数据与行为 |
| --- | --- |
| RoleListView | role code/name/active/permissionCount/description，loading/empty/error/reload；未提供的元数据显示 `—` |
| RolePermissionMatrixView | Role × Permission；每角色保存、保存时禁用编辑、失败撤销草稿并重读服务端；保存成功刷新唯一 AccessStore 与矩阵 |
| MyAccessView | 直接读取 AccessStore 的 username/auth_source/roles/permissions，刷新按钮调用 loadAccess；不使用 getMyAccess 创建副本 |

### Admin 0.3.3 接入

本版本对齐 drf-unified-rbac 0.3.3。Permission Registry 为只读目录，角色权限和本地用户角色分别授权。

## 安装与权限

```ts
import {
  createRbacAdminApi, createRbacAdminPlugin, createRbacAdminRoutes,
  createRbacAdminMenu, filterMenus, installRbacGuard,
} from '@scotec/vue-unified-rbac'
import '@scotec/vue-unified-rbac/style.css'

const permissions = {
  roleView: 'rbac.role.view',
  roleCreate: 'rbac.role.create',
  roleUpdate: 'rbac.role.update',
  roleDelete: 'rbac.role.delete',
  rolePermissionView: 'rbac.role_permission.view',
  rolePermissionUpdate: 'rbac.role_permission.update',
  userRoleView: 'rbac.user_role.view',
  userRoleUpdate: 'rbac.user_role.update',
  permissionView: 'rbac.permission.view',
}
// request 复用宿主的 Local/SSO/Hybrid 凭据、CSRF 和错误处理。
const api = createRbacAdminApi(request)
app.use(createRbacAdminPlugin({ api, permissions, editable: true }))
for (const route of createRbacAdminRoutes({ permissions })) router.addRoute(route)
installRbacGuard(router, { accessStore: rbac.accessStore })
// 放在 computed 内，使菜单随认证/权限变更重新计算。
const menus = filterMenus(createRbacAdminMenu({ permissions }),
  rbac.accessStore.hasPermission, rbac.accessStore.isAuthenticated)
```

九个 mapping 字段均可覆盖，省略字段使用上面的正式默认值；也可传 permissions: {}。
插件和路由应共享同一 mapping。mapping 只配置权限名称，不授予权限；授权来自 /me。

| 页面 | 路由/菜单 | 页面读取 | 写入 |
| --- | --- | --- | --- |
| 角色列表 | roleView | roleView | roleCreate / roleUpdate / roleDelete 独立判断 |
| 角色权限矩阵 | rolePermissionView | roleView + permissionView + rolePermissionView，AND | rolePermissionUpdate |
| 本地用户角色 | userRoleView | userRoleView | userRoleUpdate；编辑弹窗加载角色目录还需要 roleView |
| 当前用户权限 | requiresAuth: true | 已认证且有效的 AccessStore 数据 | 仅刷新 /me |

当前用户页没有额外管理权限，普通业务用户可访问。guard 支持 requiresAuth；自定义 guard 须实现相同语义。
filterMenus 新增可选第三参数 isAuthenticated，缺省 false，认证菜单默认隐藏；公共菜单和权限菜单保持原语义。
permissionMetaKey 不能使用保留的 requiresAuth 或 rbacAdminTitle。

所有写按钮还需 editable === true 和相应 API 方法存在。supportsUpdates 仅保留为矩阵兼容提示，false 可禁用矩阵编辑，缺省由 updateRolePermissions 方法决定；不控制 Role CRUD/UserRole。
矩阵缺少任一读取权限时不发送 API；只读矩阵显示 ✓ / —，没有复选框和保存按钮。

## 默认 HTTP contract

basePath 默认 /api/rbac/admin，可覆盖且会去除末尾斜杠。

| 方法 | URL | Client |
| --- | --- | --- |
| GET / POST | /api/rbac/admin/roles/ | listRoles / createRole |
| GET / PATCH / PUT / DELETE | /api/rbac/admin/roles/{id}/ | getRole / updateRole / deleteRole |
| GET / PUT | /api/rbac/admin/roles/{id}/permissions/ | getRolePermissions / updateRolePermissions |
| GET | /api/rbac/admin/permissions/ | listPermissions |
| GET | /api/rbac/admin/permissions/{id}/ | getPermission |
| GET | /api/rbac/admin/users/ | listLocalUsers |
| GET / PUT | /api/rbac/admin/users/{id}/roles/ | getLocalUserRoles / updateLocalUserRoles |
| GET | /api/rbac/me | getMyAccess |

updateRole 默认 PATCH，roleUpdateMethod: 'put' 可切换 PUT。Permission 不提供创建、修改、删除方法或 UI。
RolePermission 默认 PUT body 为 { permission_codes: string[] }，UserRole 默认 PUT body 为 { role_codes: string[] }。
响应同时接受 canonical 字段和 permissions/roles alias 或裸数组；alias 不影响默认请求字段。

```ts
// 只覆盖 me，所有其他默认能力仍存在。
const api = createRbacAdminApi(request, { endpoints: { me: '/custom/me' } })
// 显式关闭可选能力；undefined 仍继承默认值。
const limited = createRbacAdminApi(request, { endpoints: {
  localUsers: null, localUserRoles: null, updateLocalUserRoles: null,
  updateRolePermissions: null, roleDetail: null,
} })
```

endpoints 是 Partial<RbacAdminEndpoints>，采用 merge，不再整体替换。
roleDetail: null 关闭角色详情/修改/删除；createRole 使用 roles 集合端点，独立保留。
如需关闭所有 UI 写入，使用 editable: false；自定义 API 可省略各写方法。

默认 RolePermission 函数接收 code，通过 listRoles 缓存的 code → id 查找 URL；先加载角色目录。
自定义 rolePermissions/updateRolePermissions 回调仍接收 code。各 endpoint 独立覆盖，不会推导关联 endpoint。
例如只覆盖 roles URL，不会自动改变 roleDetail；整组前缀变化应使用 basePath。
/me 独立于 basePath。Axios baseURL 已含 /api 时，设置 basePath: '/rbac/admin' 和 endpoints.me: '/rbac/me'。

列表自动读取 DRF page-number 分页全部 results，仅提取 next 页码，后续请求仍访问配置 URL。
列表 adapter 若提供，须返回完整目录。角色转换 enabled/is_active → active、permission_count → permissionCount；
本地用户稳定保留 id、username、roles，并转换 is_active、auth_source、role_source。

角色创建可填 code，编辑 code 只读且默认更新体不包含 code。rbac_admin 或 protected/is_protected 为 true 的角色不可删除；缺少 ID 的旧目录行不显示编辑/删除。
用户列表及当前角色只需 userRoleView，无更新权限仍正常展示。仅 Local/rbac_db 身份提供角色分配，SSO 角色由 Keycloak 管理。
保存完整集合并保留目录外已有 code；成功刷新 AccessStore 与列表，失败展示后端校验信息，会话切换丢弃迟到结果。

## Demo 与验证

npm run dev 后打开 /?admin-demo&editable 演示 Role CRUD、矩阵修改和用户角色分配。
/?admin-demo&editable&readonly 模拟有读取权限但没有写权限；/?admin-demo 为未开启 editable 的只读模式。
Demo 使用内存数据，刷新恢复；Permission 目录只读，包含真实九项管理权限。

运行 npm test、npm run type-check、npm run build、npm run build:demo、npm pack。
项目没有 lint script。Node 要求 >=22.18.0。产物 scotec-vue-unified-rbac-0.3.3.tgz 包含 dist JS、异步页面、声明与 style.css。

## 宿主升级

删除为补齐默认 Role CRUD/UserRole 而写的 endpoint 补丁、标准响应 snake_case 转换 adapter、标准集合请求字段改写 adapter。
旧合并写权限应改为独立九项 mapping；当前用户页的管理权限配置移除。
保留宿主认证初始化、Axios 实例、Token/Session/CSRF、异常处理、路由挂载、guard、菜单转换、CSS 和 editable 显式开关。
自定义 URL、非标准响应或特殊权限命名仍需保留相应配置。
这是从旧 endpoint 整体替换改为合并的行为变化：需要禁用能力必须显式 null，不能再靠省略 endpoint。

样式采用 .rbac-admin- 前缀和 --rbac-admin-* CSS Variables。必须显式导入 style.css，可覆盖 --rbac-admin-primary、--rbac-admin-bg、--rbac-admin-radius 等变量。


## 0.2.0 新增公共导出

全部从 `@scotec/vue-unified-rbac` 包根导入：

- `HybridAuthManager`、`createHybridAuthManager`，`AuthMode`、`AuthSource`、`HybridAuthOptions`。
- `createRbacAdminApi`，`RbacAdminApi`、`RbacAdminEndpoints`、`RbacAdminApiOptions`、`RbacRole`、`RbacPermission`。
- `createRbacAdminPlugin`、`useRbacAdmin`，`RbacAdminOptions`、`RbacAdminPermissions`、`RbacAdminRouteOptions`。
- `RoleListView`、`RolePermissionMatrixView`、`MyAccessView`。
- `createRbacAdminRoutes`、`createRbacAdminMenu`。

原有导出全部保留。AccessStore 新增 `loadAccess()` 别名，保留 `loadMyAccess()` 与 `reloadAccess()`。AccessResult 保留 string auth_source / authSource 兼容自定义 provider 元数据，不因新增 AuthSource 收窄旧类型。

## 0.1.x → 0.2.0 Migration

1. SSO consumer 原 `createRbacPlugin({ pinia, auth, loadAccess })`、原 Provider 初始化、原 request interceptor、原 store/router/menu/directive 调用可继续使用；不必 import Admin。原 SSO Demo 保持此路径，回归测试保留。
2. `rbac.auth` 现在是实现 AuthProvider 的协调器，而不是传入 Provider 的同一对象。不要依赖对象恒等、`instanceof KeycloakAuthProvider` 或 provider 私有方法；需要 SDK 特有功能时保留原始 `auth` 引用。这是可观察的兼容性变化，不能声称绝对零 breaking change。
3. Hybrid consumer 增加 `mode: 'hybrid'`，改为初始化 `rbac.auth.init()`，并将 interceptor 参数改为 `rbac.auth`；不要先运行原始 `sso.init()`。把旧无条件 SSO 恢复逻辑拆成 Local/SSO 回调。
4. Local 登录成功后设置 source，再 loadAccess。已有 Local 登录恢复成功时也可标记 source。Logout 改调 rbac.logout，并提供 localLogout；不要同时再调用原始登出 API。
5. 只需要 Admin 的 consumer 才安装 Admin plugin，明确配置 endpoints/权限码，再由宿主挂路由和菜单。未确认写入 API 时保持只读。
6. 多个 RBAC 应用共享同一 origin 且会话不同，给每个应用配置不同 storageKey；每个 Pinia 只创建一个 RBAC plugin。SSR 每个请求独立创建 Pinia/manager，并传 storage:null，禁止共享全局会话。

发布系统建议修改：认证启动模块/main.ts、登录页成功回调、Axios 安装/401 分流模块、Logout 入口、Router 和菜单配置，以及新增的 Admin API 配置模块。以上是宿主职责建议，当前仓库未包含真实发布系统源码，不能宣称已修改其具体文件。

发布系统继续保留：Local 表单/API/密码处理/凭据持久化策略/CSRF、登录页布局、业务 API、业务权限码、菜单结构、路由挂载与错误提示。Library 只接管认证来源协调和统一授权。

详细交付清单、调用链及实际验证结果见 [V2 交付记录](docs/08-v2-upgrade.md)。


### Admin UI 样式

使用内置 Admin 页面时，在宿主入口显式加载：

```ts
import '@scotec/vue-unified-rbac/style.css'
```

库提供隔离的基础样式和可覆盖的 CSS Variables，JS 公共 API 保持不变。完整接入、主题设置与无后端 Demo 见 [Admin UI 文档](docs/11-admin-ui.md)。

### Admin 版本

当前版本为 0.3.3，完整接入说明见 [Admin 文档](docs/11-admin-ui.md)。
