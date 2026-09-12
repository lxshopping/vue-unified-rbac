import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import { createContext, SourceTextModule, SyntheticModule } from 'node:vm'
import ts from 'typescript'
import * as vue from 'vue'
import * as pinia from 'pinia'
import * as axiosModule from 'axios'
import * as vueRouter from 'vue-router'

const root = fileURLToPath(new URL('../', import.meta.url))
const environment = {
  VITE_API_BASE_URL: '/api',
  VITE_KEYCLOAK_URL: 'https://sso.example.test',
  VITE_KEYCLOAK_REALM: 'ops',
  VITE_KEYCLOAK_CLIENT_ID: 'rbac-demo',
}
const me = (permissions = ['demo.order.view']) => ({
  username: 'test-user', auth_source: 'sso', roles: ['demo_admin'], permissions,
})

// 每个实例模拟一次完整页面加载；共享 Map 模拟跨 Keycloak 回跳保留的会话标记。
async function harness({ storage = new Map(), storageBlocked = false, env = environment } = {}) {
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
    let resolved = specifier.startsWith('@/')
      ? path.join(root, 'src', specifier.slice(2))
      : path.resolve(path.dirname(parent.identifier), specifier)
    if (!path.extname(resolved)) resolved += '.ts'
    return moduleFor(resolved)
  }
  async function load(relative) {
    const mod = await moduleFor(path.join(root, relative))
    if (mod.status === 'unlinked') await mod.link(linker)
    if (mod.status === 'linked') await mod.evaluate()
    return mod.namespace
  }
  const auth = await load('src/auth/keycloak.ts')
  const request = (await load('src/api/request.ts')).default
  const activePinia = pinia.createPinia()
  pinia.setActivePinia(activePinia)
  const store = (await load('src/stores/access.ts')).useAccessStore(activePinia)
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
  return { auth, request, store, load, respond, events, storage, get keycloak() { return instance } }
}

const logins = (h) => h.events.filter(([event]) => event === 'login')
const requests = (h) => h.events.filter(([event]) => event === 'request')

test('initialization is shared, uses code flow and PKCE, keeps tokens out of storage', async () => {
  const h = await harness()
  const first = h.auth.initKeycloak()
  assert.equal(first, h.auth.initKeycloak())
  assert.equal(await first, true)
  assert.equal(h.keycloak.options.flow, 'standard')
  assert.equal(h.keycloak.options.pkceMethod, 'S256')
  assert.equal(h.keycloak.options.checkLoginIframe, false)
  assert.equal(h.keycloak.config.realm, 'ops')
  assert.equal(h.auth.getAccessToken(), 'test-access-token')
  assert.equal(h.storage.size, 0)
})

test('missing SSO configuration rejects initialization clearly', async () => {
  const h = await harness({ env: { ...environment, VITE_KEYCLOAK_REALM: '' } })
  await assert.rejects(h.auth.initKeycloak(), /缺少 Keycloak 配置/)
})

test('Axios waits for refresh and uses the new token for a token-free business API', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  h.keycloak.updateToken = async (seconds) => {
    assert.equal(seconds, 30)
    await new Promise((resolve) => setTimeout(resolve, 5))
    h.keycloak.token = 'refreshed-test-token'
  }
  const { fetchMyAccess } = await h.load('src/api/rbac.ts')
  const result = await fetchMyAccess()
  assert.equal(result.username, 'test-user')
  assert.equal(requests(h)[0][2], 'Bearer refreshed-test-token')
  assert.equal(h.storage.size, 0)
})

test('simultaneous 401 failures start only one login and invalidate permissions', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  await h.store.loadMyAccess()
  h.respond(401)
  await Promise.allSettled([h.request.get('/one'), h.request.get('/two')])
  assert.equal(logins(h).length, 1)
  assert.equal(logins(h)[0][1].prompt, 'login')
  assert.equal(h.store.hasPermission('demo.order.view'), false)
  assert.equal(h.store.me, null)
  assert.equal(h.auth.isAuthenticated(), false)
  assert.deepEqual([...h.storage.values()], ['1'])
})

test('relogin flag survives a full redirect, F5, and successful me before another API 401', async () => {
  const storage = new Map()
  const first = await harness({ storage })
  await first.auth.initKeycloak()
  first.respond(401)
  await assert.rejects(first.request.get('/rbac/me'))
  assert.equal(logins(first).length, 1)
  for (let reload = 0; reload < 2; reload++) {
    const next = await harness({ storage })
    await next.auth.initKeycloak()
    await next.store.loadMyAccess()
    next.respond(401)
    await assert.rejects(next.request.get('/business'), /停止自动重登/)
    assert.equal(logins(next).length, 0)
  }
})

test('SDK refresh failure cannot bypass login guard or send the old token', async () => {
  const h = await harness({ storage: new Map([['rbac.sso.relogin-attempted', '1']]) })
  await h.auth.initKeycloak()
  h.keycloak.updateToken = async () => {
    h.keycloak.clearToken() // SDK 400 refresh failure has this behavior.
    throw new Error('Session expired')
  }
  await assert.rejects(h.request.get('/rbac/me'), /停止自动重登/)
  assert.equal(logins(h).length, 0)
  assert.equal(requests(h).length, 0)
})

test('unauthenticated and missing-token requests never reach the API', async () => {
  for (const unauthenticated of [true, false]) {
    const h = await harness()
    await h.auth.initKeycloak()
    h.keycloak.authenticated = !unauthenticated
    h.keycloak.token = undefined
    await assert.rejects(h.request.get('/rbac/me'))
    assert.equal(logins(h).length, 1)
    assert.equal(requests(h).length, 0)
  }
})

test('blocked session storage stops automatic redirect but permits explicit login', async () => {
  const h = await harness({ storageBlocked: true })
  await h.auth.initKeycloak()
  h.respond(401)
  await assert.rejects(h.request.get('/rbac/me'), /无法保存重登标记/)
  assert.equal(logins(h).length, 0)
  await h.auth.login()
  assert.equal(logins(h).length, 1)
})

test('403 is passed to business callers without reauthentication or loss of me', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  await h.store.loadMyAccess()
  h.respond(403)
  await assert.rejects(h.request.get('/business'), (error) => error.response.status === 403)
  assert.equal(logins(h).length, 0)
  assert.equal(h.store.hasPermission('demo.order.view'), true)
  assert.equal(h.auth.authenticationError.value, null)
})

test('public routes never load permissions; protected navigation shares and caches me', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  const router = (await h.load('src/router/index.ts')).default
  await router.push('/')
  await router.push('/403')
  assert.equal(requests(h).length, 0)
  const loading = h.store.loadMyAccess()
  assert.equal(loading, h.store.loadMyAccess())
  await Promise.all([loading, router.push('/release/orders')])
  assert.equal(router.currentRoute.value.path, '/release/orders')
  await router.push('/rbac/me')
  await router.push('/release/orders')
  assert.equal(requests(h).length, 1)
})

test('absence of view permission denies orders regardless of admin role', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  h.respond(200, me([]))
  const router = (await h.load('src/router/index.ts')).default
  await router.push('/release/orders')
  assert.equal(router.currentRoute.value.path, '/403')
  assert.equal(h.store.hasPermission('demo.order.view'), false)
  assert.equal(requests(h).length, 1)
})

test('me failure stays out of 403 and does not repeatedly load or login on navigation', async () => {
  for (const status of [401, 403, 500]) {
    const h = await harness({ storage: new Map([['rbac.sso.relogin-attempted', '1']]) })
    await h.auth.initKeycloak()
    h.respond(status)
    const router = (await h.load('src/router/index.ts')).default
    await router.push('/release/orders')
    assert.equal(router.currentRoute.value.path, '/')
    await router.push('/release/orders')
    assert.equal(router.currentRoute.value.path, '/')
    assert.equal(requests(h).length, 1)
    assert.equal(logins(h).length, 0)
  }
})

test('failed me loads can be explicitly retried without redesigning the store', async () => {
  const h = await harness()
  await h.auth.initKeycloak()
  h.respond(500)
  await assert.rejects(h.store.loadMyAccess())
  assert.equal(h.store.loaded, true)
  assert.equal(h.store.hasPermission('demo.order.view'), false)
  h.respond(200)
  await h.store.loadMyAccess()
  assert.equal(h.store.error, null)
  assert.equal(h.store.hasPermission('demo.order.view'), true)
})

test('logout calls Keycloak with the application origin and clears only the login flag', async () => {
  const storage = new Map([['rbac.sso.relogin-attempted', '1'], ['unrelated', 'keep']])
  const h = await harness({ storage })
  await h.auth.initKeycloak()
  await h.auth.logout()
  const event = h.events.find(([name]) => name === 'logout')
  assert.equal(event[1].redirectUri, 'http://127.0.0.1:8080')
  assert.equal(storage.has('rbac.sso.relogin-attempted'), false)
  assert.equal(storage.get('unrelated'), 'keep')
})
