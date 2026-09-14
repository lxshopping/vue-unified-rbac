# 下一阶段 Codex 提示词（伪代码确认后再使用）

> 历史 Demo / Consumer Example 文档：其中的业务权限码、接口和页面属于宿主示例，不是 Library 内置功能或本次开发范围。当前公共 API 与目录以 [README](../README.md) 和 [Library 改造记录](07-library-refactor.md) 为准。


```text
请在当前 vue-unified-rbac 项目中，只实现 RBAC V1 的第一条最小闭环，不要扩展范围。

目标：
Vue 登录后从后端 GET /api/rbac/me 获取当前用户 roles 和 permissions，保存到 Pinia，并使用 permission code 控制静态菜单、页面和发布单按钮。

请严格遵守现有 docs/01-pseudocode.md 和代码 TODO。

实现范围：
1. src/demo/api/rbac.ts
   - 实现 GET /api/rbac/me
   - Authorization Bearer token 的获取封装成可替换函数；不要实现 Keycloak SDK
   - 请求异常必须 default deny

2. src/lib/access/store.ts
   - 实现 loadMyAccess
   - 实现 hasPermission(code)
   - 前端只能检查 permissions.includes(code)
   - 禁止 role -> permission 映射
   - 禁止 admin 特权判断

3. src/demo/layouts/AppLayout.vue
   - 静态菜单仍保留
   - 根据 menu.permission + hasPermission 过滤显示

4. src/demo/router/index.ts
   - 实现 route.meta.permission guard
   - 没权限跳 /403
   - 不做动态 route.addRoute

5. src/demo/views/release/ReleaseOrderView.vue
   - 根据 release.order.create / approve / deploy 控制三个按钮显示

6. src/demo/views/rbac/MyPermissionView.vue
   - 显示当前 username/authSource/roles/permissions

不要实现：
- 动态菜单
- 后端菜单 API
- v-permission directive
- Role CRUD
- Permission CRUD
- RolePermission Matrix 保存
- UserRole 修改
- Keycloak SDK
- UI 组件库重构

完成后：
- 列出修改文件
- 解释 /api/rbac/me -> accessStore -> hasPermission -> menu/router/button 调用链
- 给出需要人工测试的 5 个场景
```
