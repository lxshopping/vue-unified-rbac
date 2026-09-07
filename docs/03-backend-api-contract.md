# 后端 API 依赖

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
