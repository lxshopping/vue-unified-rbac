# V2 / 0.2.0 交付记录

本次在现有 Library 上增量升级，保留唯一 AccessStore、Router Guard、Menu Filter、v-permission 和原 SSO Consumer。未复制宿主 Local Login API，没有保存密码，没有创建 Local/SSO 两套权限状态，也没有新增 UI 框架。版本为 0.2.0，未发布 npm。

## 修改文件及原因

以下仅列本次新增或编辑的源码/文档，不把任务开始前已有的工作区修改算成本次成果。

| 文件 | 原因 |
| --- | --- |
| `package.json` | 版本 0.2.0；不改变依赖和原构建策略 |
| `package-lock.json` | 同步根包版本 |
| `src/lib/auth/types.ts` | 新增 AuthMode/AuthSource，以及可选 passive-init/token-clear 能力；保留原 AuthProvider 必需方法 |
| `src/lib/auth/keycloak-provider.ts` | 新增 initPassive，Hybrid 回调初始化不设置 onLoad；纯 SSO 仍保持 login-required |
| `src/lib/auth/hybrid-manager.ts` | 新增独立协调器；来源存储/恢复、按来源初始化/登出/401 回调，以及会话版本 |
| `src/lib/auth/index.ts` | 导出 Hybrid 类、工厂与类型 |
| `src/lib/access/store.ts` | 新增 loadAccess 别名，复用现有单一状态、验证与请求失效机制 |
| `src/lib/axios/interceptor.ts` | Local 透传、SSO Token 注入；401 分流、旧会话 401 忽略、refresh 中会话切换取消请求；保留原始 Provider 的旧 response 策略 |
| `src/lib/types.ts` | 扩展兼容的 Plugin options；上下文 auth 提供协调器能力 |
| `src/lib/plugin.ts` | 将协调器与唯一 AccessStore 连接，会话变化清空权限；不自动安装 Router/Axios/Admin |
| `src/lib/index.ts` | 保留原 exports，统一导出 Hybrid 与可选 Admin |
| `src/lib/admin/api/types.ts` | 声明可替换的 Admin API、端点、角色/权限模型、响应适配与更新能力 |
| `src/lib/admin/api/client.ts` | 集中 HTTP 实现、可配置端点/方法/body、响应校验、默认只读 |
| `src/lib/admin/types.ts` | Admin 安装、权限码、路由选项类型 |
| `src/lib/admin/context.ts` | 独立可选 Admin plugin / injection；校验必填权限码 |
| `src/lib/admin/views/shared.ts` | 共享加载/错误/权限状态，丢弃登出或卸载后的过期响应 |
| `src/lib/admin/views/RoleListView.ts` | 原生 Vue 角色列表与 loading/empty/error/reload |
| `src/lib/admin/views/RolePermissionMatrixView.ts` | 权限矩阵、显式编辑授权、保存反馈、失败草稿回退、服务端重读与 /me 刷新 |
| `src/lib/admin/views/MyAccessView.ts` | 直接显示/刷新 AccessStore，不复制当前用户权限 |
| `src/lib/admin/router/routes.ts` | 可配置的懒加载 route definitions 与菜单 helper；宿主主动挂载 |
| `src/lib/admin/index.ts` | 公开 Admin API/类型/插件/懒加载 Views/路由与菜单 |
| `tests/hybrid.test.mjs` | 16 项 Hybrid、SSO、Local、存储、401、登出、竞态与清理失败测试 |
| `tests/admin.test.mjs` | 13 项 Admin API/路由/组件权限/加载/保存/回退/失败拒绝测试 |
| `tests/helpers/renderer.mjs` | 使用真实 Vue renderer/reactivity 执行组件，并检查渲染树和交互 |
| `tests/types/v2.ts` | 从包根导入新能力的 Consumer 类型检查 |
| `README.md` | 三种认证模式、登录页、Admin、API 适配、宿主职责与迁移示例 |
| `docs/03-backend-api-contract.md` | 明确区分历史建议与 V2 待确认契约 |
| `docs/08-v2-upgrade.md` | 本交付清单与验证记录 |

页面采用 `.ts` + Vue defineComponent/h，实现真实 Vue 组件；保留原有 tsc 声明生成和构建配置，不需要新增 SFC 编译依赖。生成的 dist、demo-dist 不纳入源码提交。

## Hybrid / Local / SSO / me 调用链

```text
createRbacPlugin → HybridAuthManager → restoreAuthSource
  ├─ null：停留宿主公共登录页，不初始化 Keycloak、不加载权限
  ├─ local：不初始化 Keycloak，宿主会话凭据继续生效
  └─ sso：纯 SSO init / Hybrid initPassive 处理回调

Local：宿主旧登录 API → setAuthSource(local) → AccessStore.loadAccess
SSO：loginSso → setAuthSource(sso) → initPassive → Keycloak.login
     → callback → 恢复 sso → initPassive → AccessStore.loadAccess

AccessStore.loadAccess / 原 loadMyAccess
  → 校验当前认证候选状态
  → 宿主 loadAccess loader
  → GET /api/rbac/me
      local：宿主 cookie/session/token
      sso：refreshToken → getAccessToken → Authorization Bearer
  → normalizeAccess 校验/复制
  → 同一 AccessStore.me
  → menu / router / v-permission / Admin
```

授权只检查后端 permissions。角色名、来源标记不授予权限。加载中/失败/未初始化/未知 permission 均 default deny。公共登录路由不声明 permission，所以不会通过 guard 自动请求 /me。SSO 初始化必须先于 Web History 创建，保留现有 bootstrap 顺序。

同一来源重新登录也清空原权限；旧 /me 不能写回。Local 401 只清状态并交 Local callback，SSO 401 清 Token/状态并交 SSO callback，不自动跳转 Keycloak。Logout 同样按来源分流且先撤销授权。

## Admin UI / API 架构

```text
Host createRbacAdminPlugin({ api, permissions, editable })
        ↓ provide
RoleListView ───────────┐
RolePermissionMatrix ──┴─ RbacAdminApi → 默认 HTTP client 或自定义 adapter
MyAccessView ───────────── 唯一 AccessStore

Host createRbacAdminRoutes(options) → router.addRoute
Host createRbacAdminMenu(options) → 宿主菜单适配 → filterMenus
```

所有管理路由使用现有 guard 的权限 meta；页面自己也检查权限。修改矩阵必须同时具有 roleView、roleManage、editable=true 和 API supportsUpdates=true。页面不直接 import axios。保存按角色进行；先更新，再刷新 /me 和管理数据；失败撤销本地草稿并重新查询，无法查询时不保留可编辑旧矩阵。写入成功但重新读取失败不会显示“保存成功并已刷新”的误导反馈。

默认 client 的管理 endpoints 全部显式配置，只有 me 默认 `/api/rbac/me`。提供 roles/permissions/rolePermissions/me 响应 adapters 和 updateBody、updateMethod；未配置更新端点即只读。复杂分页/批量/服务端冲突策略可由自定义 RbacAdminApi 实现。当前矩阵每个角色查询一次权限，不承诺大规模矩阵虚拟化。

## 新增 public exports

- HybridAuthManager、createHybridAuthManager、AuthMode、AuthSource、HybridAuthOptions。
- createRbacAdminApi、RbacAdminApi、RbacAdminEndpoints、RbacAdminApiOptions、RbacRole、RbacPermission。
- createRbacAdminPlugin、useRbacAdmin、RbacAdminOptions、RbacAdminPermissions、RbacAdminRouteOptions。
- RoleListView、RolePermissionMatrixView、MyAccessView。
- createRbacAdminRoutes、createRbacAdminMenu。

原公开导出全部保留；新增 AccessStore.loadAccess 为 loadMyAccess 别名。

## Consumer 示例与发布系统改动

完整可组合的 SSO-only、Local-only、Hybrid 初始化、登录页、Admin API、Admin 路由/菜单示例见 README 对应章节。最小核心调用：

```ts
const rbac = createRbacPlugin({ pinia, auth: keycloakProvider, mode: 'hybrid',
  loadAccess: async () => (await request.get('/api/rbac/me')).data,
  hybrid: { localLogout: existingLocalLogout, onLocalAuthError: showLocalError },
})
app.use(rbac)
installAuthInterceptor(request, rbac.auth)
await rbac.auth.init()

// Local 登录成功：
await existingLocalLogin()
rbac.auth.setAuthSource('local')
await rbac.accessStore.loadAccess()
// SSO 按钮：
await rbac.auth.loginSso()
```

发布系统需要修改其认证启动模块/main.ts、Local 登录成功事件、SSO 按钮、Axios 401 分流、Logout 入口；需要管理页时增加 Admin API 配置，挂载 Admin routes/menu。当前仓库没有真实发布系统代码，因此这里只说明应修改的位置，不虚构其文件路径，也不声称完成宿主改造。

发布系统继续拥有旧 Local Login API/表单、密码与 Local 凭据管理、CSRF、布局、业务 API/权限码、菜单模型和路由挂载。Library 不替代这些职责。

## 验证命令与实际结果

本机默认 Node 20.19.2 不满足项目声明；最终使用本机已有 Node 24.19.0。无新包下载。Windows 示例：

```powershell
$env:PATH = 'C:\Users\lixiang\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:PATH
npm test
npm run test:sso
npm run type-check
npm run build
npm run build:demo
git diff --check
npm pack --dry-run --ignore-scripts --cache .tmp/npm-cache
```

| 检查 | 实际结果 |
| --- | --- |
| npm test | 57/57 通过：原 Library 14 + 原 SSO 14 + Hybrid 16 + Admin 13 |
| type-check | 通过，含新的 Consumer 类型样例 |
| build | 通过；Vite Library JS + tsc 声明 |
| build:demo | 通过；保留原 SSO Demo |
| lint | 仓库没有 lint script/config，未运行；不将 typecheck 或 diff check 冒充 lint |
| git diff --check | 通过 |
| npm pack dry-run | 通过；包含 0.2.0 metadata、README、JS chunks 与声明；未发布 |
| Core-only tree shaking | 使用 Rollup 对 dist/index.js 的 createRbacPlugin-only consumer 构建：1 个 chunk，不含 Admin Views/API 代码 |

最初用系统 Node 20 执行 npm test 时不能展开测试 glob；切换满足 engines 的 Node 后通过。首次 pack dry-run 遇到系统 npm cache 写权限限制，改用工作区 `.tmp/npm-cache` 后通过，无需扩大权限。

测试使用真实 Vue/Pinia/Router/Axios，替换网络与 Keycloak SDK；Admin UI 使用 Vue 自定义 host renderer 验证组件状态和点击/checkbox 事件，不是浏览器端到端测试。没有真实 Keycloak、Django Admin API、发布系统账号联调，不应将自动测试结果表述为生产验收。

## 兼容性与迁移

默认 mode 为 sso，原始 Provider/插件/拦截器/store/router/menu/directive 用法保留且回归通过。需要注意的可观察变化：`rbac.auth` 变为协调器，不再与传入 Provider 对象恒等；自定义 Hybrid SSO Provider 需要 initPassive。不能笼统宣称绝对无 breaking change。

迁移步骤：

1. 旧纯 SSO consumer 可保持原代码，更新到 0.2.0。
2. Hybrid 增加 mode，改调用 rbac.auth.init；interceptor 使用 rbac.auth；移除旧无条件 Keycloak 401 恢复。
3. Local 登录成功后 mark/set source，调用 loadAccess。登出用 rbac.logout + 宿主 localLogout 回调。
4. 如需 SDK 特有方法，保留原 Provider 引用，不对 rbac.auth 做 Keycloak instanceof 判断。
5. Admin 单独安装，确认 endpoints/权限码后挂路由/菜单；未确认写接口时保持只读。

## 尚未确认的后端 contract

仅 `/api/rbac/me` 是现有授权入口；现有文档中的管理 URL 为历史设计建议。尚待确认：管理接口实际 URL/尾斜杠、角色 code/ID 标识、列表 envelope/分页、enabled/active 与 permission count 字段、角色权限返回结构、更新是否存在/HTTP 方法/body、权限码、并发修改冲突及事务语义。Library 对这些提供配置或 API 替换点；没有自行猜测后宣称联调成功。
