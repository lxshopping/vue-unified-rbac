# 实现顺序（按“先测试 → 拆解 → 复述 → 修改 → 重写 → Review”）

## Step 1 — 只看伪代码

重点读：

1. `src/types/rbac.ts`
2. `src/api/rbac.ts`
3. `src/stores/access.ts`
4. `src/config/menu.ts`
5. `src/router/index.ts`
6. `src/views/release/ReleaseOrderView.vue`

自己复述：

```text
/api/rbac/me
 -> accessStore
 -> hasPermission
 -> menu/page/button
```

## Step 2 — 自己先写两个核心方法

只写：

```text
hasPermission(code)
loadMyAccess()
```

不要先写 directive。

## Step 3 — Codex 实现第一条闭环

让 Codex 只实现：

```text
/api/rbac/me client
accessStore
发布单按钮权限
router guard
```

不要实现 RolePermission Matrix CRUD。

## Step 4 — 修改

自己至少做一次：

```text
新增 release.order.cancel
```

然后把取消按钮接入权限。

## Step 5 — 重写

不看 Codex 代码，自己重新写：

```text
hasPermission()
route guard
```

## Step 6 — Review

重点 Review：

1. Vue 有没有根据 role 推导 permissions？如果有，删掉。
2. 未加载/异常时是不是 default deny？
3. 页面隐藏后，后端 API 是否仍有 RBACPermission？
4. permission code 前后端是否完全一致？
5. SSO UserRole 是否保持只读？
