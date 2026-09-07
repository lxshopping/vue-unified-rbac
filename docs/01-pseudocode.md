# Vue Unified RBAC V1 — 核心伪代码

## 目标

V1 只解决四件事：

1. Vue 获取后端 `/api/rbac/me`。
2. Pinia 保存当前用户有效权限。
3. 静态菜单 / 静态路由根据 permission code 决定是否显示/进入。
4. 页面按钮根据 permission code 决定是否显示。

后端 DRF `RBACPermission` 仍是最终安全边界。

---

## 1. 登录后的权限初始化

```text
Keycloak 登录成功
    ↓
前端获得 access token
    ↓
调用 GET /api/rbac/me
Authorization: Bearer <token>
    ↓
后端：
Token -> Principal -> SSO Role -> RolePermission -> Permission
    ↓
返回：
username
auth_source
roles[]
permissions[]
    ↓
Vue accessStore 保存
```

## 2. /api/rbac/me 预期数据

```json
{
  "username": "alice",
  "auth_source": "sso",
  "roles": ["release_developer"],
  "permissions": [
    "release.order.view",
    "release.order.create",
    "release.order.deploy"
  ]
}
```

前端 TypeScript 可以映射 `auth_source -> authSource`，也可以第一版直接保持 snake_case；关键是前后端契约固定。

## 3. AccessStore

```text
state:
    me = null
    loaded = false

loadMyAccess():
    me = await GET /api/rbac/me
    loaded = true

hasPermission(code):
    if me == null:
        return false

    return code exists in me.permissions

reset():
    me = null
    loaded = false
```

禁止：

```text
if role == admin:
    return true
```

Vue 不负责 Role -> Permission 计算。

## 4. 静态菜单

```text
staticMenus = [
    首页,
    发布单(permission=release.order.view),
    角色管理(permission=rbac.role.view),
    权限管理(permission=rbac.permission.view),
    角色权限(permission=rbac.role_permission.view),
    用户角色(permission=rbac.user_role.view),
    我的权限
]

visibleMenus = []

for menu in staticMenus:
    if menu.permission is empty:
        visibleMenus.add(menu)
    else if accessStore.hasPermission(menu.permission):
        visibleMenus.add(menu)
```

菜单结构仍然是前端固定的，所以这是静态菜单，不是动态菜单。

## 5. 页面权限

```text
route.meta.permission = release.order.view

beforeEach(to):
    if accessStore not loaded:
        loadMyAccess()

    required = to.meta.permission

    if required is empty:
        allow

    if hasPermission(required):
        allow
    else:
        redirect /403
```

## 6. 按钮权限

第一阶段不要封装 `v-permission`，先写清楚：

```text
canApprove = accessStore.hasPermission('release.order.approve')

if canApprove:
    show 审批按钮
else:
    hide 审批按钮
```

理解以后再封装 directive。

## 7. 发布单验证场景

```text
release_admin:
    release.order.view
    release.order.create
    release.order.approve
    release.order.deploy

release_developer:
    release.order.view
    release.order.create
    release.order.deploy

release_approver:
    release.order.view
    release.order.approve
```

验证：

```text
developer 登录
    ↓
/api/rbac/me 不包含 release.order.approve
    ↓
Vue 不显示审批按钮
    ↓
用户手工 POST /approve
    ↓
DRF RBACPermission 再判断
    ↓
403
```
