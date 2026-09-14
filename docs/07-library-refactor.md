# Library 结构改造记录（2026-09-12）

本次以工作区现有实现为基础提取通用层，保留已验证的权限判断、加载并发保护、响应式指令和 Demo 的有界认证恢复策略。未修改 DRF、Keycloak 服务配置或业务权限定义。

## 原结构与耦合

原 src 同时承载可复用权限工具和 Demo 页面，只有应用构建入口。Store 直接调用 Demo fetchMyAccess；请求地址与响应转换固定在 src/api/rbac.ts；Axios 自建实例并直接依赖 Keycloak 单例；认证单例读取宿主 env；菜单工具引用 Demo StaticMenuItem；Router 将认证恢复和业务权限判断混在一起。这些依赖使其他项目无法从包根安装通用能力。

## 提取结果

| 原职责 | 现在的位置 | 处理 |
| --- | --- | --- |
| SDK init / login / logout / updateToken | src/lib/auth | AuthProvider 接口 + KeycloakAuthProvider，配置由宿主传入 |
| env / 错误显示 / 自动重登标记 | src/demo/auth/keycloak.ts | 保留 Demo 既有策略 |
| AccessStore | src/lib/access | 注入 auth/loadAccess，保留 default deny 和请求版本控制 |
| Axios token 请求处理 | src/lib/axios | 接收宿主 AxiosInstance，返回 eject 函数 |
| Axios 创建与 response 错误处理 | src/demo/api/request.ts | 继续由宿主控制 |
| /rbac/me 路径与请求 | src/demo/api/rbac.ts | 宿主 loader |
| permission 路由授权 | src/lib/router | installRbacGuard 显式安装，可卸载 |
| 页面路由与认证失败回首页 | src/demo/router | 保留 Demo 路由 |
| v-permission | src/lib/directives | 指令工厂绑定明确 Store，插件注册 |
| 递归菜单过滤 | src/lib/menu | 纯函数、泛型保留宿主字段 |
| 权限码、菜单、布局、业务页面 | src/demo/config、layouts、views | 原页面迁移；管理空壳仍未挂载 |
| 插件和依赖注入 | src/lib/plugin.ts | provide 上下文，useRbac，便捷 logout |
| 公共 API | src/lib/index.ts | 唯一包入口 |

真正 Library 是 src/lib 下全部源文件，Demo 是 src/demo。tests/browser 是隔离浏览器测试宿主，使用假的 AuthProvider 与 Axios adapter；它不是 Demo 新功能，不连接真实后端，不发布。docs/01–05 的历史学习材料已标记 Example，避免误认为 Library 功能。

## 关键行为

1. AuthProvider 只描述六个认证操作。Store 不导入 keycloak-js，Keycloak 实现也不解析业务权限。
2. Provider 默认 login-required；固定 Authorization Code / PKCE S256；配置、回跳地址均由宿主提供。多个 Provider 不共享 SDK。
3. Axios 在请求前等待 refreshToken(30)，读取最新 Token，只设置 Authorization。host baseURL、timeout、其他 header 和 response interceptor 保留。刷新失败不能带旧 Token 发出请求。
4. createRbacPlugin 必须显式接收宿主 pinia。没有 Library createPinia。每个 Pinia 的 Provider、loader 与 Store 独立，重复配置同一个 Pinia 报错以防误覆盖。
5. loadAccess 返回 AccessResult，username/auth_source 可选，兼容 authSource。运行时校验 roles/permissions 数组，不信任网络数据的 TypeScript 断言。
6. 保留 loaded 表示“加载已结束”的语义；loading/error/me 区分过程和结果。并发 loadMyAccess 合并；reloadAccess 会使旧请求失效；clearAccess 后旧响应不能回写。
7. 权限只按 permissions.includes(code)。未加载、加载中、失败、未认证或非法参数均拒绝，admin 角色不产生授权。
8. Plugin 只注册指令、provide 上下文；不自动修改 Router 或 Axios，不自动初始化认证/请求权限。
9. Guard 接收 accessStore，默认解释 meta.permission；公共路由不加载权限，受保护路由等待加载。forbiddenRoute 默认 /403，支持命名路由。误配受保护错误页时取消导航，防自循环且不豁免权限。
10. Demo 显式设置 accessErrorRoute: '/'，保留“权限加载失败/认证失败显示错误；成功加载但缺权限才跳 403”的原行为。
11. 指令沿用占位节点和同步 watchEffect，权限变化后能恢复/隐藏，卸载释放 watcher。只接受字符串，数组默认拒绝。
12. filterMenus 不更改输入，保留自定义字段与父子递归，剔除空父菜单。缺省 permission 显示，非法值拒绝。
13. rbac.logout() 先清空权限再调用 Provider；直接 auth.logout() 时宿主显式 clearAccess。Demo 继续额外清除非敏感重登标记。

## 构建、类型与 npm 边界

- 包名 @scotec/vue-unified-rbac，版本 0.1.0；移除 private，未执行 publish。
- Vite Library Mode 入口 src/lib/index.ts，name VueUnifiedRbac，ESM 输出 dist/index.js；没有额外 UMD/CJS 入口。
- main/module 指向 dist/index.js；types 指向 dist/index.d.ts；exports 只有 "." 的 types/import。
- files 为 dist、README.md，npm 自动附加 package.json。没有 Demo、src、tests、docs、env 或 demo-dist。
- peerDependencies：vue ^3.5.0、pinia ^3.0.0、vue-router ^4.5.0、axios ^1.20.0；同时在 devDependencies 用于本仓库开发。
- keycloak-js ^26.2.4 为 dependency，使默认 Provider 可直接使用；所有五项运行依赖都 external，Library 不重复打包宿主框架或 SDK。
- tsc -p tsconfig.lib.json 只生成 src/lib 的声明；没有新增大型测试/认证/声明生成框架。
- build = 类型检查 + Library；build:lib 独立输出库；build:demo 输出 demo-dist；dev 仍运行 Demo。prepack 自动执行 build。
- 公共导出与完整 Consumer Example 见 [README](../README.md#公共导出)。

## 本次验证

使用 bundled Node.js 24.19.0（系统默认 Node 20 不符合本项目 engines；验证时显式使用合适的运行时）。

| 检查 | 结果 |
| --- | --- |
| npm install | 通过，0 vulnerabilities |
| npm run type-check | 通过，含 Demo、Library 与 Consumer 菜单类型回归 |
| npm test | 28 项通过：原 SSO 14 项 + Library 14 项 |
| npm run build | 通过 |
| npm run build:lib | 通过，ESM + 声明 |
| npm run build:demo | 通过 |
| git diff --check | 通过 |
| 浏览器真实 Vue 组件 | 已验证 Token header、菜单/按钮响应变化、无权限 403、错误重试、非法参数隐藏、Logout 清空 |
| Demo 开发启动 | 新服务 8082 启动成功；已发起真实 Keycloak code + S256 跳转 |

npm pack（含 prepack 构建）通过，得到 20 个文件的约 12.2 kB tarball；只包含 dist、README.md、package.json。已在独立 .tmp/consumer 中实际安装此 tarball，从包根导入，完成 TypeScript 检查（包含纯公共菜单）、Vite 生产构建和 Node 运行验证；深层导入被 exports 拒绝，权限/Logout 行为通过。Consumer 没有 src/lib alias，不依赖本仓库源码。

自动测试使用 Node 内置测试、TypeScript 和现有依赖。VM Modules 的实验性提示只来自测试运行器；其中一项刻意验证组件外 active Pinia 调用，会收到 Pinia 的上下文提示。生产/多应用调用优先使用显式 pinia 或 rbac.accessStore。

浏览器测试可复现：npm run dev 后打开 /tests/browser/index.html，依次测试全部权限、只读、无权限、接口失败、恢复及 Logout。该入口只用于开发测试，不进入任何构建产物。

## 真实 SSO 尚未复验完成

8080 已有旧开发服务，浏览器显示它仍在使用旧 alias 配置；该服务没有被停止或替换。需重启后使用新 Vite 配置。此次另起 8082，确认新源码可运行并发起到原 SSO 的授权跳转。

当前浏览器随后报 ERR_CERT_AUTHORITY_INVALID，无法信任内网 SSO 证书。此次未绕过证书检查，也未用真实测试账号完成回调。真实 DRF /api/rbac/me 200、真实账号权限、刷新和服务端 Logout 仍需在已信任证书、且 Keycloak 已允许该回跳地址的环境按 [SSO 验收步骤](06-sso-test.md) 复验。自动测试/模拟响应结果不代表这些已通过。

## 耦合与存储检查

- src/lib 和 dist 中没有 demo.order.*、release.order.* 或其他业务 Permission Code。
- 没有 rbac-demo、具体 Keycloak 地址、/release 路由、/rbac/me 地址或 Demo 菜单。
- 没有 import.meta.env、axios.create、createPinia、Demo import 或 any 类型。
- Library 没有 sessionStorage/localStorage 访问，更没有 Token 持久化。
- Demo 的 sessionStorage 只保留 rbac.sso.relogin-attempted=1 防循环标记，不保存 Access/Refresh/ID Token。
- demo.order.* 仅存在 Demo 配置、SSO 测试数据与明确标记的示例文档；业务命名权属于宿主。
- 全项目应用源码未出现 access_token 或 menu_code 的遗留存储/菜单协议。

## 最小接入顺序

宿主 createPinia → auth.init → 给已有 Axios 安装 Token 拦截器 → createRbacPlugin({ pinia, auth, loadAccess }) → app.use(rbac) → installRbacGuard(router, { accessStore: rbac.accessStore }) → app.use(router) → mount。

具体 main.ts、Router permission、v-permission、JS、菜单、Logout 的可复制示例见 [README](../README.md#最小-consumer-example)。
