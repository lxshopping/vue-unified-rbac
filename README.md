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
npm install /path/to/scotec-vue-unified-rbac-0.2.0.tgz
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

### Admin API 与安装

仓库后端文档只确认 `/api/rbac/me`。管理端点必须显式配置，下面路径来自 **宿主配置对象**，不是宣称已经存在的 Django API：

```ts
import {
  createRbacAdminApi, createRbacAdminPlugin,
  createRbacAdminRoutes, createRbacAdminMenu,
} from '@scotec/vue-unified-rbac'

const adminPermissions = {
  roleView: hostConfig.permissions.roleView,
  roleManage: hostConfig.permissions.roleManage,
  meView: hostConfig.permissions.meView,
}
const api = createRbacAdminApi(request, {
  endpoints: {
    roles: hostConfig.rbac.rolesUrl,
    permissions: hostConfig.rbac.permissionsUrl,
    rolePermissions: code => hostConfig.rbac.rolePermissionsUrl(encodeURIComponent(code)),
    // 后端确认支持写入后才提供；省略意味着只读。
    // updateRolePermissions: code => hostConfig.rbac.updateRolePermissionsUrl(encodeURIComponent(code)),
    me: '/api/rbac/me', // 缺省值；request.baseURL 为 /api 时改为 /rbac/me
  },
  // updateMethod: 'put', // 也支持 patch / post
})
app.use(createRbacAdminPlugin({ api, permissions: adminPermissions, editable: false }))

const routeOptions = { basePath: '/rbac-admin', permissions: adminPermissions }
for (const route of createRbacAdminRoutes(routeOptions)) router.addRoute(route)
// 或作为 createRouter({ routes: [...createRbacAdminRoutes(routeOptions)] }) 的一部分。
const adminMenus = createRbacAdminMenu(routeOptions)
// 宿主将 adminMenus 转换为自己的菜单格式，再用 filterMenus 过滤。
```

仍须手动安装 `installRbacGuard`。Admin routes 使用现有 permission meta，支持 `permissionMetaKey` / `namePrefix` / `basePath`；路由与 guard 的 meta key 必须一致。Admin plugin 与 routes 应复用同一 permissions 对象。页面内部也检查权限，直接嵌入页面不能绕过授权。权限码为必填，没有猜测的内置 rbac.*；服务端仍必须校验每个管理请求。

矩阵写入须同时满足 `editable: true`、`api.supportsUpdates === true`、AccessStore 中的 `roleManage` 权限和 `roleView` 权限。未列入权限目录的已有 grant 保存时保留，防止意外删除。当前实现按角色保存完整 permission code 数组，不提供跨角色事务；角色多时会按角色查询权限，大规模数据可提供自定义 API 缓存/批量适配。

### 默认 HTTP 数据协议与适配

下面是 **Library 的归一化协议，尚未确认真实后端完全匹配**：

```ts
interface RbacRole {
  code: string
  name?: string
  active?: boolean
  description?: string
  permissionCount?: number
}
interface RbacPermission { code: string; name?: string; description?: string }
interface RbacAdminApi {
  readonly supportsUpdates?: boolean
  listRoles(): Promise<RbacRole[]>
  listPermissions(): Promise<RbacPermission[]>
  getRolePermissions(role: string): Promise<string[]>
  updateRolePermissions(role: string, permissions: string[]): Promise<void>
  getMyAccess(): Promise<AccessResult>
}
```

HTTP 默认读取裸数组；写入默认 PUT、body `{ permissions: string[] }`，忽略更新响应体并重新查询。可通过 `adapters.roles` / `permissions` / `rolePermissions` / `me` 适配 response envelope、enabled/active、permission_count 字段，通过 `adapters.updateBody` 改写请求体。端点函数负责对角色路径参数编码（例如 encodeURIComponent）。默认 client 验证数组、代码、重复项、角色字段与 `/me` 格式，异常直接拒绝。

如果列表存在分页，adapter 必须返回完整目录；只有同步数据转换的 adapters 不会自动请求 next page。需要多次分页/批量请求时，直接实现 RbacAdminApi 注入页面，禁止把分页响应的部分列表当成全部权限。后端是否支持写入、角色标识是 code 还是 ID、URL 尾斜杠、分页/envelope、更新方法/body、并发写入冲突策略和真实 permission codes 均须宿主与后端确认。本次没有真实 Admin 后端联调或账号验收。

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
