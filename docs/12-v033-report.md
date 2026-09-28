# vue-unified-rbac 0.3.3 修改报告

## 1. 修改前问题与原因

原 client 使用 options.endpoints ?? defaults，宿主传任意 endpoints 对象就整体替换默认值。仅覆盖 roles、permissions、rolePermissions、updateRolePermissions、me 时，roleDetail、localUsers、localUserRoles、updateLocalUserRoles 会丢失。
Role CRUD 三个方法原来都在 roleDetail 存在时才生成，因此后端有 CRUD 也不会显示按钮；本地用户 API 方法同样消失，触发“请配置本地用户 Admin API”。这是已在当前源码确认的根因。

RoleListView 原有独立 create/update/delete 权限、editable、方法存在性、protected 检查本身正确，予以保留。另有矩阵用 Role 查看/修改权限替代 RolePermission 权限、缺少 Permission 目录读取检查、当前用户页需要虚构管理权限、默认集合请求字段不规范等问题。

## 2. 本次实际修改文件

- package.json、package-lock.json：0.3.3。
- src/lib/admin/api/client.ts、src/lib/admin/api/types.ts：endpoint 合并、独立 capability、详情 GET、Role PUT 选项、canonical body、类型。
- src/lib/admin/types.ts、src/lib/admin/context.ts：九项独立权限及默认值。
- src/lib/admin/router/routes.ts：矩阵主权限、me 认证语义、菜单。
- src/lib/admin/views/shared.ts、RolePermissionMatrixView.ts：读取权限 AND 门禁、独立保存权限。
- src/lib/admin/views/LocalUserRolesView.ts：缺少角色目录权限时阻止弹窗目录请求并提示。
- src/lib/admin/views/MyAccessView.ts：认证及有效 AccessStore 判断。
- src/lib/access/store.ts、src/lib/router/guard.ts、src/lib/menu/filter.ts：公开认证状态、requiresAuth、认证菜单过滤。
- src/demo/admin/bootstrap.ts：正式权限及只读权限演示。
- src/demo/views/rbac/PermissionListView.vue：清理 Permission 写入 API 提示。
- tests/admin.test.mjs、tests/admin-v032.test.mjs、tests/types/admin.ts、tests/types/v2.ts：更新旧断言、补充契约/页面/路由/类型回归。
- README.md、docs/03-backend-api-contract.md、docs/05-codex-prompt-next.md、docs/08-v2-upgrade.md、docs/11-admin-ui.md、本报告：文档同步。

RoleListView、Admin exports、核心 plugin 的现有实现经检查可复用，无需为了修改而修改。工作区原有改动未回退；未修改发布系统。

## 3. 最终 RbacAdminPermissions

| 字段 | 默认权限 |
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

字段均可选，省略使用正式默认值；插件/路由接受 permissions: {}，也支持自定义对应权限码。权限名称映射不授予任何权限。

## 4. 默认 endpoints

basePath 为 /api/rbac/admin。角色 URL 参数使用 id，路径参数编码。

| 方法 | 默认 URL |
| --- | --- |
| GET / POST | /api/rbac/admin/roles/ |
| GET / PATCH / PUT / DELETE | /api/rbac/admin/roles/{id}/ |
| GET / PUT | /api/rbac/admin/roles/{id}/permissions/ |
| GET | /api/rbac/admin/permissions/ |
| GET | /api/rbac/admin/permissions/{id}/ |
| GET | /api/rbac/admin/users/ |
| GET / PUT | /api/rbac/admin/users/{id}/roles/ |
| GET | /api/rbac/me |

新增 getRole/getPermission 可选方法；默认 client 均提供。updateRole 默认 PATCH，roleUpdateMethod: 'put' 可选 PUT。角色权限方法仍接收 role code，listRoles 建立 code → id 映射。

## 5. Endpoint 合并

endpoints 类型为 Partial<RbacAdminEndpoints>，采用 merge。只传 me 不再清空其他能力。undefined 继承默认值；可选 endpoint 显式 null 才禁用。createRole 从集合端点生成，不再绑定 roleDetail。
basePath 控制所有默认 Admin URL；me 独立。自定义 endpoint 逐项覆盖，不隐式改变其他 endpoint。

## 6. Role CRUD UI

查看要求 roleView。新增/编辑/删除分别要求 editable === true、对应操作权限和对应 API 方法。编辑/删除另需 id；rbac_admin 或 protected 的角色不可删除并展示系统保护说明。创建可填 code，编辑只读；默认 updateRole 即使接收到未类型检查的 code 也不发送它。

## 7. RolePermission UI

路由/菜单主权限为 rolePermissionView。页面读取前同时要求 roleView、permissionView、rolePermissionView，缺一项不发送 API。
保存另需 rolePermissionUpdate、editable 和 updateRolePermissions 方法；supportsUpdates === false 仍可明确关闭矩阵编辑，但不影响其他写能力。只读矩阵以 ✓ / — 展示，无编辑 checkbox 和保存按钮。

## 8. LocalUserRolesView

默认 client 提供用户列表、用户角色读取、用户角色更新，不需宿主 adapter。只需 userRoleView 即可展示用户与当前角色；写入另需 userRoleUpdate、editable、相关 API 方法。
编辑弹窗需要角色目录；缺少 roleView 时保留列表并明确提示，不请求必然失败的目录 API。
id、username、active、roles、authSource、roleSource 归一化已回归验证。SSO 身份不提供本地角色编辑。

## 9. Canonical 请求

RolePermission 默认 PUT { permission_codes: [...] }。
UserRole 默认 PUT { role_codes: [...] }。
响应仍支持 permission_codes/permissions 和 role_codes/roles，包含空集合、完整替换及旧 alias 回归。自定义 adapters 仅用于非标准宿主协议。

## 10. Permission Registry

只读 list/detail，无 Permission 创建/编辑/删除方法或操作按钮。Demo 的旧写入提示已清理。目录读取使用 permissionView。

## 11. Router/Menu

角色列表 → roleView；矩阵 → rolePermissionView；本地用户角色 → userRoleView；当前用户 → requiresAuth。
没有重构单权限 guard；矩阵多权限检查在页面内部执行。filterMenus 新增第三参数 isAuthenticated，缺省 false；宿主应传 accessStore.isAuthenticated。

## 12. 当前用户页面

不依赖独立管理权限，也不绑定角色查看权限。路由 guard 以认证及有效 /me 数据放行；页面复用唯一 AccessStore，刷新失败或登出后隐藏旧数据。普通业务用户无 Admin 权限仍可查看自身信息。

## 13. Tests

npm test：112 passed，0 failed，0 skipped。
包含 endpoint 部分覆盖、默认能力、独立 Role 操作权限、保护角色、不可修改 code、矩阵读取门禁/独立保存、UserRole 只读/写入、标准 Local 响应直接挂载、canonical 请求、alias 响应、认证路由/菜单、无管理权限的 me、会话切换与迟到结果等回归。

## 14. 构建与验证

- npm run type-check：通过。
- npm run build：通过（npm pack 的 prepack 执行）。
- npm run build:demo：通过。
- lint：项目未定义该 script；未虚报通过。
- git diff --check：通过。
- 使用本机 Node 24.19.0，满足项目 >=22.18.0 要求。系统默认 Node 20 无法运行原 test glob，已切换运行时完成验证。
- 已解包并直接 import 包内 dist，验证默认 API、单 endpoint 合并、canonical 请求、路由、四个异步页面、Admin/API/router/plugin 类型声明及 CSS。
- 正式源码、Demo、tests、文档和 dist 的旧权限标识扫描已清理；permissions/roles 仍在 /me、响应 alias、列表 adapter 等正确用途保留。
- 验证使用模拟 HTTP、Vue renderer 和产物运行检查；未连接真实 drf-unified-rbac 服务做联调。

## 15–16. 版本与包

最终版本：@scotec/vue-unified-rbac 0.3.3。
文件：scotec-vue-unified-rbac-0.3.3.tgz；39 个文件，约 36.1 kB。
旧 scotec-vue-unified-rbac-0.3.2.tgz 保留，校验未变：
SHA-256 1D599EFC993462F74B1A32CF08FD84C389BC92CA445679627B451679440DC797。

## 17. 发布系统 admin.ts 升级清单

以下为迁移建议，未直接修改发布系统，也未读取其实际 admin.ts。

可以删除：

- 为补齐默认 roleDetail/localUsers/localUserRoles/updateLocalUserRoles 写的兼容 endpoint 补丁，前提是使用标准路径。
- 手工实现标准 Role CRUD、Local UserRole HTTP 请求的方法；改用 createRbacAdminApi(http)。
- 为标准 snake_case 字段和 DRF 分页编写的重复 adapter。
- 为集合写入改成 permission_codes/role_codes 的标准协议 adapter，默认 client 已正确发送。
- 旧合并写权限配置、当前用户页的虚构管理权限映射；替换为本报告九项 mapping 或 permissions: {}。

仍须保留或调整：

- 宿主已有 Axios 实例、baseURL、Session/Token/CSRF、认证初始化/恢复和 401/403 处理。
- Admin plugin、路由挂载、installRbacGuard、菜单结构/转换、显式 CSS 导入。
- editable: true（需要编辑时）、真正自定义的 URL/响应协议/权限名称。
- 菜单 filterMenus 调用新增第三参数 accessStore.isAuthenticated；自定义 guard 处理 requiresAuth。
- 想禁用某个默认能力时使用 endpoint: null 或自定义 API 省略方法，不能继续靠省略 endpoint 表达只读。
- Axios baseURL 已包含 /api 时，配置 basePath: '/rbac/admin'、endpoints.me: '/rbac/me'，避免重复前缀。

安装新 tgz 后运行发布系统自身的类型检查和构建，并以真实后端账号验证对应权限组合。
