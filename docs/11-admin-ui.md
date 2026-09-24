# Admin UI 基础样式

```sh
npm install @scotec/vue-unified-rbac
```

宿主入口显式导入一次 CSS，无需复制样式或引入 UI 框架：

```ts
import '@scotec/vue-unified-rbac/style.css'
import { createRbacAdminRoutes, createRbacAdminPlugin } from '@scotec/vue-unified-rbac'

// 沿用宿主现有权限码和 API 配置。
const adminPermissions = {
  roleView: 'rbac.role.view',
  roleManage: 'rbac.role.manage',
  meView: 'rbac.me.view',
}
const adminRoutes = createRbacAdminRoutes({ permissions: adminPermissions })
// 将 adminRoutes 接入现有 router；沿用现有 api 实例：
// app.use(createRbacAdminPlugin({ api, permissions: adminPermissions }))
```

本项目真实公共 API 是 `createRbacAdminRoutes`、`createRbacAdminPlugin` 等；`adminRoutes` 和 `adminPermissions` 是宿主创建的变量，不是新增的库导出。现有路由、权限码和接口配置均不需要改变。

角色列表提供状态徽标、权限数量、悬停行和水平滚动。矩阵以权限为行、角色为列，在有限高度内滚动，固定表头和第一列。只读模式显示 ✓ / —；现有可编辑模式继续使用复选框，并在每个角色列底部保存。编辑仍要求 editable、更新 API 能力和管理权限同时满足。当前用户页面分为用户信息、角色、权限三张卡片，数据仍来自 AccessStore。

所有实际 CSS 选择器以 `.rbac-admin-` 开头，不重置宿主全局元素。`:root` 仅声明带前缀的主题变量。加载库样式之后覆盖变量即可；也可以在宿主包裹容器上设置变量以限定作用域：

```css
:root {
  --rbac-admin-primary: #409eff;
  --rbac-admin-radius: 8px;
}
/* 局部主题示例 */
.my-rbac-area {
  --rbac-admin-bg: #ffffff;
  --rbac-admin-bg-muted: #f7f8fa;
  --rbac-admin-text: #1f2329;
  --rbac-admin-border: #e5e6eb;
}
```

其他变量见 `src/lib/admin/styles/variables.css`，包括次级文本、成功/错误/警告色与四档间距。页面支持桌面、中屏与小于 768px 的纵向页头；表格宽度不足时横向滚动。宿主的全局高优先级样式仍可能影响组件，建议避免通用 `!important` 规则。

`src/lib-entry.ts` 是构建专用入口，导入样式并重新导出公共 JS API；公共 `src/lib/index.ts` 与其类型声明不引用样式，避免生成指向不存在源 CSS 的声明路径。构建通过 Vite 的 `cssFileName: 'style'` 固定输出 `dist/style.css`。JS 产物不自动注入 CSS；只使用认证和授权的宿主无需导入样式。`exports['./style.css']` 指向该文件，`files: ['dist', 'README.md']` 包含 CSS，`sideEffects: ['**/*.css']` 防止显式样式导入被摇树优化移除。

## Demo

运行 `npm run dev`，打开 `http://127.0.0.1:8080/?admin-demo`。顶部三个按钮切换角色列表、矩阵和当前用户页面；加 `&editable` 查看原有编辑交互。此入口使用独立内存数据，不请求后端。常规 SSO / V3 Demo 保持原入口。

`predev` 和 `build:demo` 会先构建库；Demo 的 CSS 导入解析到真实的 `dist/style.css`，没有独立 Admin 样式副本。修改库 CSS 后需重新执行 `npm run build:lib` 或重启 `npm run dev`。

验证命令：`npm run type-check`、`npm test`、`npm run test:sso`、`npm run build`、`npm run build:demo`、`npm pack --dry-run`。

## 0.3.2：Role CRUD 与本地用户角色

四个 Admin 页面由同一个 `createRbacAdminRoutes()` 生成，菜单标题来自每条路由的
`meta.rbacAdminTitle`。`createRbacAdminMenu()` 的外部调用方式不变；仍通过宿主已有
`filterMenus(menu, accessStore.hasPermission)` 隐藏无权限菜单。

| 默认路径 | View | 查看权限 |
| --- | --- | --- |
| `/rbac-admin/roles` | RoleListView | `permissions.roleView` |
| `/rbac-admin/role-permissions` | RolePermissionMatrixView | `permissions.roleView` |
| `/rbac-admin/local-user-roles` | LocalUserRolesView | `permissions.userRoleView`，默认 `rbac.user_role.view` |
| `/rbac-admin/me` | MyAccessView | `permissions.meView` |

现有 `roleManage` 仍控制矩阵写入；未配置时使用 `roleUpdate`，再默认到
`rbac.role.update`。新增按钮权限默认分别为 `rbac.role.create`、`rbac.role.update`、
`rbac.role.delete`、`rbac.user_role.update`，可通过同名 permission options 覆盖。
所有写操作仍需宿主显式设置 `editable: true`、具备操作权限且 API 提供对应方法。
缺少权限的按钮隐藏；默认只读策略保持不变。

### 对接 drf_unified_rbac 0.3.2

```ts
import {
  createRbacAdminApi, createRbacAdminPlugin, createRbacAdminRoutes,
  createRbacAdminMenu, filterMenus,
} from '@scotec/vue-unified-rbac'
import '@scotec/vue-unified-rbac/style.css'

// request 是宿主已经接好 Local / SSO / Hybrid 认证的 Axios 实例。
const api = createRbacAdminApi(request)
// 可选：createRbacAdminApi(request, { basePath: '/api/rbac/admin' })
const permissions = { roleView: 'rbac.role.view', meView: 'rbac.me.view' }
app.use(createRbacAdminPlugin({ api, permissions, editable: true }))
const routes = createRbacAdminRoutes({ permissions })
// 按宿主已有方式添加 routes，沿用现有初始化恢复流程及 installRbacGuard。
const menu = filterMenus(createRbacAdminMenu({ permissions }), rbac.accessStore.hasPermission)
```

默认 client 使用以下真实后端契约：

- `GET/POST /api/rbac/admin/roles/`；`PATCH/DELETE /api/rbac/admin/roles/{id}/`。
- `GET/PUT /api/rbac/admin/roles/{id}/permissions/`，PUT `{ permissions: string[] }`。
- `GET /api/rbac/admin/permissions/`，仅供矩阵读取。
- `GET /api/rbac/admin/users/`；`GET/PUT /api/rbac/admin/users/{id}/roles/`，PUT `{ roles: string[] }`。
- `GET /api/rbac/me`。

列表自动读取 DRF page-number 分页的全部 `results`；后续页继续向已配置 URL 发请求，
只提取 `next` 中的页码，不向响应中的其他域名发送认证信息。已有自定义列表 adapter
仍须返回完整目录（保留 0.3.1 语义）。默认矩阵通过列表中的 code → id 映射请求后端，
原有自定义 `rolePermissions(code)` 回调仍接收 code。

统一适配 `enabled/is_active → active`、`permission_count → permissionCount`、
`auth_source → authSource`、`role_source → roleSource`；权限和角色集合同时接受数组、
`permission_codes/permissions`、`role_codes/roles`。没有返回权限数时显示 `—`，不伪造统计。
Role 的 ID 保持可选以兼容旧 catalogue；缺少 ID 时不提供该行编辑/删除按钮。

角色创建要求管理员填写 code；编辑时 code 只读，PATCH 不提交 code。
`rbac_admin` 或 `protected/is_protected` 角色不显示删除按钮，已知保护角色不能在 UI 停用。
删除需确认；字段校验和后端 `detail` 显示在弹窗内。提交期间禁止重复保存，成功关闭弹窗、
刷新唯一 AccessStore 和列表，失败保留输入。后端继续承担最终保护和 403 校验。

本地用户页只展示 Local/RBAC Database 身份，兼容自定义 UserModel 的字符串或数字 ID，
不依赖 email/first_name/last_name。打开弹窗实时加载角色目录和该用户角色；保存完整集合，
保留目录外已存在的角色，允许空集合。后端最后一个管理员保护错误原文展示。

矩阵继续“编辑 → 按角色保存”，失败恢复状态；重新进入页面或从 KeepAlive 恢复会重新读目录。
当前用户页面继续读取唯一 AccessStore 的 `/me` 结果，新增角色来源：`rbac_db` 显示
RBAC Database，`keycloak` 显示 Keycloak；SSO 页面仅显示说明，不提供角色编辑。
没有新增 Permission CRUD、注册表、同步按钮或 Keycloak Admin API。

### 升级兼容性

0.3.1 的插件初始化、显式 endpoints/adapters、自定义 `RbacAdminApi`、`roleManage`、
Auth/Access/Guard/Directive 都继续兼容，不需要迁移认证初始化。
**旧自定义 API 不会凭空获得新能力**：为了使用新增 CRUD/UserRole，需要补充可选方法，
或改用上述默认 DRF client。显式 endpoints 配置可增加 `roleDetail(id)`、`localUsers`、
`localUserRoles(id)`、`updateLocalUserRoles(id)`；省略时相应操作不会启用。
已有只读宿主继续只读，开启编辑仍需 `editable: true`。

```sh
npm install /path/to/scotec-vue-unified-rbac-0.3.2.tgz
```

无需先卸载。宿主继续导入 `@scotec/vue-unified-rbac/style.css`，然后执行自己的构建。
Demo `?admin-demo&editable` 已覆盖全部四页，CRUD/角色分配使用可刷新重置的内存数据。
