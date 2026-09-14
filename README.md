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
npm install /path/to/scotec-vue-unified-rbac-0.1.0.tgz
~~~

宿主依赖：Vue ^3.5.0、Pinia ^3.0.0、Vue Router ^4.5.0、Axios ^1.20.0。使用 ESM 与 TypeScript moduleResolution: "Bundler"。本仓库开发/构建要求 Node.js >=22.18.0。

## 最小 Consumer Example

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
      const response = await request.get<AccessResult>('/rbac/me')
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

仅注册 request interceptor，不更改 baseURL、timeout、其他 headers、response interceptor 或调用方错误处理；返回函数只移除本次拦截器。安装在宿主用于受信任 API 的实例上。

401/403 等 HTTP 响应由宿主原有 response interceptor 处理。Library 不自动无限重登；Demo 保留“每标签页两次 Logout 之间最多自动重登一次”的旧策略。其 sessionStorage 仅保存非 Token 标记 rbac.sso.relogin-attempted。

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
- loadMyAccess()：显式加载，合并并发请求；调用已结束后再次调用会重新加载。
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

也可使用 rbac.logout() / useRbac().logout()，它在委托 auth.logout() 前清空权限，即使登出失败也不保留之前的授权。Library 不修改或包裹宿主原始 auth.logout() 方法，直接调用它时宿主负责 clearAccess。Demo 的 Logout 同时清除其非敏感重登标记。

## 公共导出

唯一源码入口是 src/lib/index.ts；宿主只从包根导入，禁止深层导入 src/lib 或 Demo。

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
    plugin.ts
    types.ts
    index.ts         # 唯一公共入口
  demo/
    auth/            # env、错误提示、401 有界恢复
    api/             # 宿主 Axios 实例、/rbac/me 地址
    config/          # Demo 权限码与静态菜单
    router/          # Demo 路由与认证错误恢复
    layouts/
    views/           # 原有页面；未挂载的管理空壳仅保留
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
