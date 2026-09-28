# Admin 0.3.3 接入

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
