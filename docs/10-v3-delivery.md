# 前端 V3 / 0.3.0 交付报告

分支：`codex/v3-adapter-rbac`。在 V2 上增量实现；没有 Git commit、没有 npm publish、没有修改后端仓库。以下检查使用本机 Node v24.19.0，npm cache 指向工作区 `.tmp/npm-cache`。

## 1. V2 架构分析

V2 已有 AuthProvider / Keycloak Provider、HybridAuthManager、唯一 AccessStore 和可选 Admin。认证来源由 manager 明确维护，权限由宿主 loader 请求 /me，guard/menu/directive/Admin 复用 Store。主要缺口是默认 Local Authentication provider、Django Session/CSRF 配置、Local 登录后的统一加载，以及 /me 来源与缓存的协调。保留原实现，没有重写 Keycloak、Admin、router/menu/directive。

## 2. V3 架构

```text
DjangoLocalProvider / HostLocalProvider / KeycloakAuthProvider
                         ↓ Authentication
                  HybridAuthManager.source
                         ↓
                  GET /api/rbac/me
                         ↓
                 唯一 AccessStore
                         ↓
             menu / router / button / Admin
```

Authentication source may differ. Authorization source does not.
Frontend authorization always comes from: GET /api/rbac/me.

## 3–4. 修改文件与原因

本轮内容变更涉及 14 个已有文件，另新增 7 个文件。任务开始时已有全仓文件模式差异，未重置或计作本轮实现。

| 文件 | 修改原因 |
| --- | --- |
| `src/lib/auth/local-provider.ts`（新增） | Local provider/types、Django CSRF/Session 登录登出、Host 回调适配；不管理权限 |
| `src/lib/auth/hybrid-manager.ts` | 增加 localProvider、loginLocal、notifyLocalAuthenticated、error、Local CSRF 初始化、服务端来源同步和登录竞态保护 |
| `src/lib/auth/types.ts` | AuthSource 包含 null，完整表达未选择认证来源 |
| `src/lib/auth/index.ts` | 导出 Local 工厂及相关类型 |
| `src/lib/access/store.ts` | 有效 /me 来源同步；自定义 loader 的 401/失效认证清理；同步过程中会话切换仍拒绝旧结果 |
| `src/lib/axios/interceptor.ts` | Local credentials/CSRF 配置；清除重试请求中 Library 注入的旧 Bearer；保留宿主 Authorization |
| `src/lib/plugin.ts` | 兼容 auth 配置对象，提供默认 Pinia、/me loader、access 别名、restoreSession，绑定认证成功后的权限加载 |
| `src/lib/types.ts` | 扩展兼容的 Plugin options/context、RbacAuthOptions |
| `src/lib/index.ts` | 保留 V2 exports，增加 V3 工厂/类型 |
| `src/demo/main.ts` | 环境变量选择 V3 示例；原 SSO 示例保留 |
| `src/demo/v3/bootstrap.ts`（新增） | Local/SSO/Hybrid 三种 consumer 配置与 callback/session 恢复 |
| `src/demo/v3/AuthDemo.vue`（新增） | Local 表单、SSO 登录、登出、/me 刷新、角色权限与权限按钮 |
| `tests/hybrid.test.mjs` | 仅修正共享 fixture 的 /me 来源，随当前会话返回；保留 16 项测试及断言 |
| `tests/local.test.mjs`（新增） | 21 项 Local/V3、来源冲突、恢复、CSRF、401、竞态、导出回归 |
| `tests/types/v3.ts`（新增） | 包根导入、默认 Local、自定义 Host 凭据及配置类型检查 |
| `README.md` | V3 入口、最小配置和统一授权原则 |
| `docs/03-backend-api-contract.md` | 记录已从后端源码确认的 V3 Local 端点与 CSRF 轮换 |
| `docs/09-v3-migration.md`（新增） | 四种场景、完整迁移、配置、错误处理和 Demo 使用说明 |
| `docs/10-v3-delivery.md`（新增） | 本报告 |
| `package.json` | 0.2.0 → 0.3.0；依赖和原 scripts 不变 |
| `package-lock.json` | 同步根包版本；未更新依赖 |

## 5. Django Local 调用链

`loginLocal(credentials) → 清旧 access/source → GET csrf → POST login → GET csrf（轮换后）→ source=local → /me → AccessStore`。

`logout → 先清 access/source → GET csrf → POST logout → 清 provider 内存 CSRF`。后端失败抛给 consumer，前端仍保持拒绝状态。

## 6. Host Local 调用链

原 `hostLogin(form) → setAuthSource('local') → loadAccess()` 完整保留。可选择 `hostLogin → notifyLocalAuthenticated()`，或 `createHostLocalProvider → loginLocal → host callback → /me`。不会调用默认 RBAC Login API，宿主无需修改表单/验证码/凭据/API。

## 7. SSO 调用链

保持 `loginSso → source=sso → Keycloak init/login → callback → init → loadAccess → refresh/Bearer → /me`。新增 restoreSession 可合并 callback 初始化与 /me；loginSso 保持原导航语义，不提前加载权限。

## 8. Hybrid 调用链

明确选择 Local 或 SSO 后走各自 Authentication，再进入同一 /me 和 Store。有效 /me 的 auth_source 覆盖缓存。没有根据 token/roles/username 猜测来源，没有静默 fallback。

## 9. CSRF / Session

已只读核对本机后端 `authentication/views.py`、`urls.py`、README：默认 `/api/rbac/auth/local/csrf`、`/login`、`/logout` 均无尾斜杠，CSRF 返回 csrfToken，登录轮换 secret，logout 返回 204。全部认证端点及 /me 均可覆盖。

Django provider 默认 withCredentials=true，可配置；使用 csrftoken / X-CSRFToken。响应体 token 支持 HttpOnly/CSRF_USE_SESSIONS，登录后及刷新恢复时更新。存在响应体 token 时不允许 Axios 用前端 origin 的同名 cookie 覆盖，避免跨域 token 混淆；cookie-only init 则保留 Axios 浏览器自动 XSRF 行为。密码不存 Pinia/localStorage/sessionStorage，不签 JWT、不绕过 CSRF。

## 10. Axios 变化

仅 source=sso 注入 Bearer。Local 采用 provider 配置，Host Local 未提供配置时保持原请求。重试旧 config 会去除本 interceptor 注入过的 Bearer，保留其他宿主 Authorization；eject 清理记录。仅在可信 API client 上安装，不修改全局 Axios defaults。默认 /me loader 自动安装，旧自定义 loader 保持宿主手动安装策略。

## 11. 401 行为

Local：清 access/source，保留 local mode，记录错误并调用 Local 回调，不跳 SSO。

SSO：清 token/access/source，调用 SSO 回调，不尝试 Local。

Hybrid：只清当前会话，consumer 展示两种登录选择。旧会话迟到的 401 不清新会话。403 不触发自动重登。自定义 /me loader 的 401 同样清状态。

## 12. 新增 public API

`createDjangoLocalProvider`、`createHostLocalProvider`、`LocalAuthProvider`、`LocalRequestConfig`、`LocalLoginCredentials`、`DjangoLocalProviderOptions`、`HostLocalProviderOptions`、`RbacAuthOptions`。

Manager：`loginLocal`、`notifyLocalAuthenticated`、`error`；Plugin：`access`（原 Store 别名）、`restoreSession`。Auth 配置可使用 `{ mode, localProvider, sso }`，也可沿用原顶层 mode/auth/hybrid/loadAccess。

## 13. Backward compatibility

V2 runtime exports、AuthProvider、Keycloak、setAuthSource、markLocalAuthenticated、Store 方法、Admin、guard/menu/directive 全保留。没有删除原测试。旧 Hybrid fixture 的固定 local 与测试中的 SSO 会话矛盾，已仅修正模拟返回来源，新测试另行覆盖真实来源冲突。

可观察变化明确记录：AuthSource 扩展 null，使用 exhaustive 类型判断的 consumer 需处理 null；/me 来源现在覆盖旧缓存。配置新 Local Provider 时 provider.logout 优先于 legacy localLogout，避免重复注销。

## 14. V2 → V3 Migration

SSO consumer 原则上无需修改。Hybrid + Host Local 继续现有 hostLogin/setAuthSource/loadAccess。仅希望开箱即用的新项目选择 DjangoLocalProvider。完整可复制配置见 [迁移指南](09-v3-migration.md)。已有 Pinia 请显式传入；自定义 loader 的请求实例仍由宿主安装 manager interceptor。

## 15–20. 验证结果

| 命令 | 实际结果 |
| --- | --- |
| `npm test` | **78/78**：原 V2 57 项 + 新增 V3 21 项；Admin 13 项保持通过 |
| `npm run test:sso` | **14/14** |
| `npm run type-check` | 通过，包含 V2/V3 consumer 类型样例 |
| `npm run build` | 通过，Vite Library + TypeScript declarations |
| `npm run build:demo` | 通过；另外启用 VITE_RBAC_V3=true / hybrid 的示例构建也通过 |
| `npm pack --dry-run` | 通过，实际执行 prepack 构建；0.3.0，36 个文件，26.8 kB 压缩 / 84.5 kB 解包；未发布 |
| `git diff --check` | 通过 |

无新增专用 script；所有新增 runtime tests 已包含在 npm test 中。最终日志在工作区 `.tmp/v3-final-*.log`。

自动测试使用真实 Vue/Pinia/Axios，替换网络和 Keycloak SDK；CSRF 验证包括 token 初始化/轮换、HTTP 请求配置、HttpOnly/session 恢复和 cookie-only 配置路径。本轮没有真实浏览器 Cookie/CORS、Django/Keycloak 账号联调，不能将这些自动测试描述成生产端到端验收。

## 21. Git diff --stat

原始命令输出汇总：`78 files changed, 163 insertions(+), 31 deletions(-)`。其中很多零行差异是任务开始前已存在的 `100755 → 100644` 文件模式变化，不是本轮源码改动。

只在命令级忽略文件模式（没有修改 Git config）的内容统计：

```text
 README.md                       | 15 +++++++++++
 docs/03-backend-api-contract.md |  6 ++++-
 package-lock.json               |  4 +--
 package.json                    |  2 +-
 src/demo/main.ts                |  6 ++++-
 src/lib/access/store.ts         |  9 +++++++
 src/lib/auth/hybrid-manager.ts  | 58 ++++++++++++++++++++++++++++++++++++++---
 src/lib/auth/index.ts           |  2 ++
 src/lib/auth/types.ts           |  2 +-
 src/lib/axios/interceptor.ts    | 23 +++++++++++++---
 src/lib/index.ts                |  3 +++
 src/lib/plugin.ts               | 41 ++++++++++++++++++++++-------
 src/lib/types.ts                | 21 ++++++++++-----
 tests/hybrid.test.mjs           |  2 +-
 14 files changed, 163 insertions(+), 31 deletions(-)
```

Git diff 默认不计入未跟踪文件；上面的 7 个新增文件已经写入工作区，单独列在文件表中，未暂存或提交。Review 时请一并查看。

完成后停止，等待人工 review。
