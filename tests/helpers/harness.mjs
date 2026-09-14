import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as pinia from 'pinia'
import * as axiosModule from 'axios'
import * as vueRouter from 'vue-router'

const root = fileURLToPath(new URL('../../', import.meta.url))
export const environment = {
  VITE_API_BASE_URL: '/api',
  VITE_KEYCLOAK_URL: 'https://sso.example.test',
  VITE_KEYCLOAK_REALM: 'ops',
  VITE_KEYCLOAK_CLIENT_ID: 'rbac-demo',
}
export const me = (permissions = ['demo.order.view']) => ({
  username: 'test-user', auth_source: 'sso', roles: ['demo_admin'], permissions,
})

// 每个实例模拟一次完整页面加载；共享 Map 模拟跨 Keycloak 回跳保留的会话标记。
export async function harness({ storage = new Map(), storageBlocked = false, env = environment } = {}) {
  const events = []
  let instance
  class FakeKeycloak {
    constructor(config) {
      this.config = config
      this.authenticated = true
      this.token = 'test-access-token'
      this.loginRequired = false
      instance = this
    }
    async init(options) {
      this.options = options
      this.loginRequired = options.onLoad === 'login-required'
      return this.authenticated
    }
    async updateToken(seconds) {
      events.push(['refresh', seconds])
      return false
    }
    async login(options) { events.push(['login', options]) }
    async logout(options) { events.push(['logout', options]) }
    clearToken() {
      this.authenticated = false
      this.token = undefined
      if (this.loginRequired) void this.login()
    }
  }
  const sessionStorage = {
    getItem(key) {
      if (storageBlocked) throw new Error('Storage blocked')
      return storage.get(key) ?? null
    },
    setItem(key, value) {
      if (storageBlocked) throw new Error('Storage blocked')
      storage.set(key, value)
    },
    removeItem(key) {
      if (storageBlocked) throw new Error('Storage blocked')
      storage.delete(key)
    },
  }
  const context = createContext({
    console, URL, URLSearchParams, setTimeout, clearTimeout,
    sessionStorage,
    window: { location: { origin: 'http://127.0.0.1:8080', href: 'http://127.0.0.1:8080/release/orders' } },
  })
  const externals = {
    vue, pinia, axios: axiosModule,
    'keycloak-js': { default: FakeKeycloak },
    'vue-router': { ...vueRouter, createWebHistory: vueRouter.createMemoryHistory },
  }
  const cache = new Map()
  function synthetic(id, exports) {
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context, identifier: id })
  }
  async function moduleFor(id) {
    if (cache.has(id)) return cache.get(id)
    const pending = (async () => {
      if (externals[id]) return synthetic(id, externals[id])
      // Router 测试只替换视图，保留真实 Router、Pinia、Axios、RBAC 与认证代码。
      if (id.endsWith('.vue')) return synthetic(id, { default: { render: () => null } })
      const source = await readFile(id, 'utf8')
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      })
      return new SourceTextModule(outputText, {
        context, identifier: id, initializeImportMeta: (meta) => { meta.env = env },
      })
    })()
    cache.set(id, pending)
    return pending
  }
  async function linker(specifier, parent) {
    if (externals[specifier]) return moduleFor(specifier)
    let resolved = specifier === '@scotec/vue-unified-rbac'
      ? path.join(root, 'src/lib/index.ts')
      : specifier.startsWith('@/')
      ? path.join(root, 'src/demo', specifier.slice(2))
      : path.resolve(path.dirname(parent.identifier), specifier)
    if (!path.extname(resolved)) resolved = existsSync(resolved + '.ts') ? resolved + '.ts' : path.join(resolved, 'index.ts')
    return moduleFor(resolved)
  }
  async function load(relative) {
    const mod = await moduleFor(path.join(root, relative))
    if (mod.status === 'unlinked') await mod.link(linker)
    if (mod.status === 'linked') await mod.evaluate()
    return mod.namespace
  }
  const auth = await load('src/demo/auth/keycloak.ts')
  const request = (await load('src/demo/api/request.ts')).default
  const activePinia = pinia.createPinia()
  pinia.setActivePinia(activePinia)
  const lib = await load('src/lib/index.ts')
  const { fetchMyAccess } = await load('src/demo/api/rbac.ts')
  const rbac = lib.createRbacPlugin({ pinia: activePinia, auth: auth.auth, loadAccess: fetchMyAccess })
  const store = rbac.accessStore
  // 与 bootstrap 一样，认证失败立即清除唯一一份权限状态。
  vue.watch(auth.authenticationError, (error) => {
    if (error) store.clearAccess()
  }, { flush: 'sync' })
  function respond(status, data = me()) {
    request.defaults.adapter = async (config) => {
      events.push(['request', config.url, config.headers.Authorization])
      const response = { config, data, status, statusText: String(status), headers: {} }
      if (status >= 400) throw new axiosModule.AxiosError('HTTP ' + status, undefined, config, undefined, response)
      return response
    }
  }
  respond(200)
  const guarded = new WeakSet()
  async function consumerLoad(relative) {
    const module = await load(relative)
    if (relative === 'src/demo/router/index.ts' && !guarded.has(module.default)) {
      lib.installRbacGuard(module.default, { accessStore: store, forbiddenRoute: '/403', accessErrorRoute: '/' })
      guarded.add(module.default)
    }
    return module
  }
  return { auth, request, store, lib, rbac, activePinia, load: consumerLoad, respond, events, storage, get keycloak() { return instance } }
}

