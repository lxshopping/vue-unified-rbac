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
