# 实现顺序（按“先测试 → 拆解 → 复述 → 修改 → 重写 → Review”）

> 历史 Demo / Consumer Example 文档：其中的业务权限码、接口和页面属于宿主示例，不是 Library 内置功能或本次开发范围。当前公共 API 与目录以 [README](../README.md) 和 [Library 改造记录](07-library-refactor.md) 为准。


## Step 1 — 只看伪代码

重点读：

1. `src/demo/types/rbac.ts`
2. `src/demo/api/rbac.ts`
3. `src/lib/access/store.ts`
4. `src/demo/config/menu.ts`
5. `src/demo/router/index.ts`
6. `src/demo/views/release/ReleaseOrderView.vue`

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
