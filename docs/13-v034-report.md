# RBAC 前端 0.3.4 修改总结

## 交付状态

包：`@scotec/vue-unified-rbac@0.3.4`。分支：`feat/rbac-v0.3.4`。
后端依据：`E:/code/drf-unified-rbac/docs/rbac-034-contract.md` 与同目录实现报告。
管理权限继续使用 `rbac.*`，未迁移到 manage.*，未添加权限 alias。

开发前 Git 显示的 99 项改动全部为文件模式 100755 → 100644，没有代码内容差异；
保留该状态，没有改 Git 配置或回退文件。以下清单仅统计本次实际内容修改。
没有修改后端或发布系统宿主，没有 push、merge、tag、commit 或 npm publish。

## 修改文件

- `src/lib/admin/api/types.ts`：可选审计方法、endpoint、adapter 和公开数据类型。
- `src/lib/admin/api/client.ts`：basePath 下的只读审计列表/详情、单页查询及响应校验。
- `src/lib/admin/types.ts`：auditView、includeAudit 可选配置。
- `src/lib/admin/context.ts`：默认 rbac.audit.view。
- `src/lib/admin/index.ts`：AuditLogView 与四项审计类型导出。
- `src/lib/admin/router/routes.ts`：可选审计路由及对应菜单 metadata。
- `src/lib/admin/views/RolePermissionMatrixView.ts`：撤销确认、关键/自身权限警告、后端业务提示和失败后重载。
- `src/lib/admin/views/LocalUserRolesView.ts`：角色撤销/清空确认，原列表及未提交草稿保持一致。
- `src/lib/admin/views/shared.ts`：按 code/detail/permissions 提取保护错误，补充 HTTP 状态提示。
- `src/lib/admin/styles/form.css`：响应式筛选布局。
- `src/lib/admin/styles/layout.css`：安全 JSON 文本展示样式。
- `tests/admin.test.mjs`、`tests/admin-v032.test.mjs`：旧保存测试适配新增确认流程。
- `tests/types/admin.ts`：可选审计扩展和字符串身份 ID 类型检查，保留旧 client 调用。
- `README.md`、`docs/03-backend-api-contract.md`、`docs/11-admin-ui.md`：契约、接入和升级说明。
- `package.json`、`package-lock.json`：代码测试、类型检查与构建通过后升至 0.3.4。

## 新增文件

- `src/lib/admin/views/AuditLogView.ts`：审计只读页面。
- `tests/admin-v034.test.mjs`：13 项新测试。
- `tests/pack-v034.mjs`：已安装 tgz 的公开导出、五个异步页面、声明和 CSS 检查。
- `docs/13-v034-report.md`：本总结。

RoleListView 的删除确认、取消、拒绝后的列表保留可以直接复用，本次未修改该页面；
增加了真实保护错误格式的回归测试。auth、access、router guard、指令及 MyAccess 核心实现未改。

## 审计 API 类型与路由

新增可选 `listAuditLogs(query?: AuditLogQuery): Promise<AuditLogPage>`、
`getAuditLog(id: string | number): Promise<AuditLog>`，旧自定义 RbacAdminApi 无需补齐方法。
默认 GET `{basePath}/audit-logs/`、`{basePath}/audit-logs/{id}/`，basePath 默认 `/api/rbac/admin`。
没有任何 Audit 写方法或按钮。

AuditLog 包含 id（number）、actor_type、actor_id、actor_name、action、target_type、
target_id、target_name、before_data、after_data、created_at、request_id、result、reason_code。
actor_id/target_id 为 string，before/after 为由 JsonValue 组成的 JSON object；不写死业务结构。
result 为 success/denied/failed，action 为开放 string，以兼容后端新增动作。
AuditLogPage 为 count/next/previous/results。每次只读取一页，默认 50、最大 200。
AuditLogQuery 包含 page/page_size、八项精确过滤和 created_after/created_before。

页面支持操作人、动作、目标类型/ID、结果、时间范围、前后翻页和单条详情。
时间输入采用本地时间，发送带 Z 的 ISO-8601；筛选变化重置到第一页。
分页只提取 page，过滤条件保留，不跟随响应中的外部 URL。详情及列表有会话失效保护。
JSON 使用 Vue 文本节点而非 HTML，凭据相关键附加遮蔽。后端负责安全快照；
自由文本中的任意秘密不能靠前端通用识别，业务名称、描述和请求 ID 不应包含凭据。

新增路由 `{basePath}/audit-logs`（路由 basePath 默认 `/rbac-admin`），
默认名称 `rbac-admin-audit-logs`，标题“审计日志”。
`createRbacAdminRoutes({ permissions, includeAudit: true })` 显式启用；不传时仍返回四条旧路由。
createRbacAdminMenu 使用同一配置生成权限信息，宿主自行决定菜单展示。
context、路由 metadata、菜单及页面内部检查均使用 auditView，默认 `rbac.audit.view`。
宿主仍必须安装 installRbacGuard，并以 filterMenus 过滤菜单；直接挂载页面也会检查权限。

## 最终管理权限

| 配置字段 | 默认权限 |
| --- | --- |
| roleView | rbac.role.view |
| roleCreate | rbac.role.create |
| roleUpdate | rbac.role.update |
| roleDelete | rbac.role.delete |
| rolePermissionView | rbac.role_permission.view |
| rolePermissionUpdate | rbac.role_permission.update |
| userRoleView | rbac.user_role.view |
| userRoleUpdate | rbac.user_role.update |
| permissionView | rbac.permission.view |
| auditView | rbac.audit.view |

权限 override、endpoint override、adapter 扩展继续可用。/me 不添加 user_id，
授权仍由其 permissions 决定；不能从 rbac_admin/release_admin/release_viewer 名称推导授权。
MyAccess 仍仅要求认证，普通用户可查看自身权限，不因此获得 Admin 管理权限。

## 危险操作与错误

删除角色保留确认弹窗。矩阵撤销任意已有权限时增加确认/取消，提示全量替换及撤销项；
关键权限为当前 mapping 的 rolePermissionUpdate/userRoleUpdate，另外提示管理能力风险。
当前 /me.roles 包含目标角色时增加可能撤销自身权限的警告。
本地用户撤销任意角色或清空角色前统一警告，包括可能影响自身管理能力；
不使用 username 推断最后管理员或合并 Local/SSO 身份。

HTTP 400 的 rbac_last_admin / rbac_last_critical_permission 按 code 识别，
完整保留 detail，permissions 只展示字符串元素；不解析英文 detail 推断类型。
兼容 0.3.3 字段校验响应；401、403、404、405、5xx 缺少 detail 时也有明确提示。
矩阵失败后恢复并重新读取真实数据，刷新失败与原业务拒绝一起展示，不显示假成功。
用户角色拒绝后原列表不变、弹窗保留未提交草稿，用户可以取消。所有成功写入沿用 /me 刷新。
确认只属于交互，不向后端发送 confirm=true 等绕过参数，不计算最后管理员。

## 兼容与边界

未发现破坏性公开 API 变更：旧权限码、公开导出、AccessStore、hasPermission、指令、
Local/SSO/Hybrid 和 createRbacAdminRoutes 调用保持兼容。新增能力和参数均可选。
行为增强：撤销操作增加确认，错误信息更明确；宿主自动化点击流程需适配确认按钮。

Permission 继续只读；前端只分配后端同步目录中已有权限，不创建/修改/删除 Permission code。
Keycloak Client Role name 精确等于 RBAC Role.code。SSO 用户成员关系只读，由 Keycloak 管理；
Local 角色由 RBAC Admin 管理。不新增 Keycloak Admin API、角色猜测、映射或 Unknown SSO Role 日志。

## 验证

最终验证运行时 Node 22.23.3，满足 >=22.18.0。初始系统 Node 20 与 Linux 风格
node_modules 命令不适配，已使用独立 Node 22 并按锁文件安装 Windows 依赖。

- npm test：125 passed，0 failed，0 skipped（原有 112 项加 13 项）。
- npm run type-check：通过；npm run build 和 npm pack 的 prepack 均包含类型检查。
- npm run build：通过，包含审计异步 chunk 和声明。
- npm run build:demo：通过。
- npm pack：通过，41 个文件，约 40.1 kB；dist、README、package.json，无 tests/src/临时目录。
- 独立消费目录安装 tgz：通过；确认包不是源码 junction/symlink。
- 消费项目 TypeScript 检查和 Vue 3/Vite 生产构建：通过。
- tests/pack-v034.mjs：公开导出、旧四路由、新五路由、各异步页面、声明和 CSS 通过。
- 项目无 lint script，没有虚报 lint 通过。

测试覆盖三类角色的 /me、菜单及直接路由访问；审计 API 参数、分页、过滤、详情、安全 JSON、
无写按钮、拒绝访问、会话切换及迟到响应；两种管理员保护错误、取消、不提前发请求、
失败后状态和 Role 删除拒绝。原有测试继续覆盖 CRUD、矩阵、Local/SSO/Hybrid、MyAccess、
权限按钮/指令、403、刷新恢复和旧公开调用。
采用模拟 HTTP、Vue renderer 与内存路由，没有连接真实后端或执行真实浏览器端到端测试。
前端测试不替代后端 RBACPermission 的 API 越权测试，也不证明数据库最后管理员安全算法。

## 宿主 0.3.3 → 0.3.4 操作说明

1. 按后端契约完成后端 0.3.4 升级、迁移及权限同步，明确分配 rbac.audit.view。
2. 安装本次 tgz：`npm install /path/to/scotec-vue-unified-rbac-0.3.4.tgz`。
3. 保留认证初始化、Axios、CSRF/Token/Session、loadAccess、Store、guard、指令与 CSS。
4. 需要审计时对路由与菜单共用配置增加 includeAudit: true；不要重复安装插件或守卫。
5. 自定义旧 Admin client 要启用审计时，补齐 listAuditLogs/getAuditLog，或使用默认 client。
6. permissions override 与路由共用，正式权限仍为 rbac.*，不做 manage.* 替换。
7. 重新获取 /me，使用有/无审计权限、Local/SSO 身份验证菜单、直接路由和危险操作错误。
8. 执行宿主自己的类型检查和构建，再连接真实后端完成业务验收。

完整代码示例、endpoint/adapter 覆盖及菜单/按钮用法见 [Admin 接入](11-admin-ui.md)。

产物：`E:/code/vue-unified-rbac-starter/vue-unified-rbac/scotec-vue-unified-rbac-0.3.4.tgz`。
未 push、未 merge、未 tag，未修改稳定分支。
