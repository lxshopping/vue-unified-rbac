# 后端 API 依赖

当前 Admin 0.3.3 contract 以 [Admin 接入](11-admin-ui.md) 为准：默认完整 DRF endpoints、Permission 只读、集合写入使用 permission_codes/role_codes。下文保留早期阶段记录。

> 历史 Demo / Consumer Example 文档：其中的业务权限码、接口和页面属于宿主示例，不是 Library 内置功能或本次开发范围。当前公共 API 与目录以 [README](../README.md) 和 [Library 改造记录](07-library-refactor.md) 为准。


## 第一阶段必须有

### GET /api/rbac/me

用于 Vue 登录后加载当前用户权限。

建议返回：

```json
{
  "username": "alice",
  "auth_source": "sso",
  "roles": ["release_developer"],
  "permissions": ["release.order.view"]
}
```

## 第二阶段：RBAC 管理页面需要

当前 drf-unified-rbac 主要是授权核心；要让 Vue 真正管理 Role / Permission / RolePermission，还需要 management APIs。

建议后续再设计：

```text
GET    /api/rbac/roles
GET    /api/rbac/permissions
GET    /api/rbac/role-permissions
PUT    /api/rbac/roles/{role_code}/permissions
GET    /api/rbac/users/{user}/roles
```

Local 模式可以再提供 UserRole 修改 API；SSO 模式 User -> Role 只读，不提供修改能力。

不要为了先做页面而急着一次性实现所有管理 API。第一阶段只用 `/api/rbac/me` 跑通发布单按钮即可。

## V2 / 0.2.0 契约边界

上述管理 URL 仍是历史建议，不代表服务端已经实现。0.2.0 的可选 Admin client 要求宿主显式传入 roles、permissions、rolePermissions 端点；只有 me 默认 `/api/rbac/me`。updateRolePermissions 端点缺省时只读，管理权限码也必须显式配置。

归一化数据结构、响应适配、分页/更新约束和接入示例见 [README 的 Admin 章节](../README.md#optional-rbac-admin-ui)，待确认事项与测试边界见 [V2 交付记录](08-v2-upgrade.md)。本次未进行真实 Admin 后端联调。

## V3 / 0.3.0 Local Authentication

已核对后端 V3 README 与源码。新增端点：GET `/api/rbac/auth/local/csrf` 返回 `{ csrfToken }`，POST `/api/rbac/auth/local/login` 接收 username/password 并返回 `{ authenticated: true }`，POST `/api/rbac/auth/local/logout` 返回 204；均无尾斜杠，可在前端 provider 中覆盖。登录会轮换 CSRF secret，必须刷新 token。`/api/rbac/me` 仍是唯一授权入口，contract 不变。详见 [V3 Migration](09-v3-migration.md)。上面的 Admin 历史端点建议仍不作为本轮联调证明。
