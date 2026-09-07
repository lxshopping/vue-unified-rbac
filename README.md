# vue-unified-rbac

Vue 3 RBAC 前端学习/复用骨架。

当前阶段刻意只做：

- 静态菜单
- 静态路由
- RBAC 5 个页面空壳
- `/api/rbac/me` 数据模型
- AccessStore 伪代码
- 页面/按钮权限伪代码
- Permission Code 命名规则

**没有实现完整 RBAC。** 这是为了按“先理解伪代码 → 自己补核心 → Codex 实现 → 修改 → 重写 → Review”的方式学习。

## 本地建议初始化

Vue 官方当前推荐使用 `create-vue`（Vite）创建项目，并可直接选择 TypeScript、Vue Router、Pinia。

如果你要在本机从官方脚手架重新生成：

```bash
cd /mnt/e/code
npm create vue@latest
```

项目选择建议：

```text
Project name: vue-unified-rbac
TypeScript: Yes
JSX: No
Vue Router: Yes
Pinia: Yes
Vitest: No（第一步先不加）
E2E: No
ESLint: Yes
Prettier: Yes
DevTools: No
```

然后把本骨架 `src/` 与 `docs/` 的设计迁入即可。

## 当前骨架直接运行

依赖安装成功后：

```bash
npm install
npm run dev
```

注意：核心 access API/store 仍是 TODO，但当前静态页面不会调用它，因此可以先浏览目录和页面结构。

## 首先阅读

```text
docs/01-pseudocode.md
docs/02-permission-convention.md
docs/04-learning-steps.md
```
