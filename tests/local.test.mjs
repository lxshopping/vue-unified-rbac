import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios, { AxiosError } from 'axios'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { harness } from './helpers/harness.mjs'

const localAccess = { username: 'alice', auth_source: 'local', roles: ['reader'], permissions: ['item.read'] }
function ssoProvider() {
  return { calls: [], authenticated: true,
    async init() { this.calls.push('init') }, async initPassive() { this.calls.push('passive') },
    async login() { this.calls.push('login') }, async logout() { this.calls.push('logout') },
    isAuthenticated() { return this.authenticated }, getAccessToken() { return 'sso-token' },
    async refreshToken() { this.calls.push('refresh'); return true },
    clearToken() { this.calls.push('clear'); this.authenticated = false },
  }
}
async function fixture(mode = 'local', providerOptions = {}) {
  const { lib } = await harness()
  const calls = []
  let failUrl
  let data = localAccess
  let csrf = 0
  const client = axios.create({ adapter: async config => {
    calls.push(config)
    if (config.url === failUrl) throw new AxiosError('Unauthorized', undefined, config, undefined, { status: 401 })
    const body = config.url.endsWith('/csrf') ? { csrfToken: 'csrf-' + (++csrf) }
      : config.url.endsWith('/login') ? { authenticated: true } : data
    return { data: body, config, status: 200, statusText: 'OK', headers: {} }
  } })
  const localProvider = lib.createDjangoLocalProvider({ instance: client, ...providerOptions })
  const api = axios.create({ adapter: client.defaults.adapter })
  const sso = ssoProvider()
  const rbac = lib.createRbacPlugin({ pinia: createPinia(), auth: { mode, localProvider, sso, storage: null }, instance: api })
  return { lib, rbac, sso, calls, client, api, localProvider,
    fail(url) { failUrl = url }, respond(value) { data = value } }
}
const credentials = { username: 'alice', password: 'not-persisted' }

test('Django Local authenticates with CSRF, rotates token, and loads the single AccessStore', async () => {
  const f = await fixture()
  await f.rbac.auth.loginLocal(credentials)
  assert.deepEqual(f.calls.map(c => c.url), ['/api/rbac/auth/local/csrf', '/api/rbac/auth/local/login', '/api/rbac/auth/local/csrf', '/api/rbac/me'])
  assert.equal(f.calls[1].headers.get('X-CSRFToken'), 'csrf-1')
  assert.equal(f.calls[3].headers.get('X-CSRFToken'), 'csrf-2')
  assert.equal(f.calls[3].withCredentials, true)
  assert.equal(f.calls[1].xsrfCookieName, 'csrftoken')
  assert.equal(f.calls[1].xsrfHeaderName, 'X-CSRFToken')
  assert.equal(f.calls[1].withXSRFToken, false)
  assert.equal(f.rbac.auth.source, 'local')
  assert.equal(f.rbac.access, f.rbac.accessStore)
  assert.equal(f.rbac.access.hasPermission('item.read'), true)
  assert.equal(JSON.stringify(f.rbac.access.$state).includes(credentials.password), false)
  assert.deepEqual(f.sso.calls, [])
})

test('failed Django login clears previous source, roles, permissions without persisting request error', async () => {
  const f = await fixture()
  await f.rbac.auth.loginLocal(credentials)
  f.fail('/api/rbac/auth/local/login')
  await assert.rejects(f.rbac.auth.loginLocal(credentials))
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.rbac.access.roles.length, 0)
  assert.equal(f.rbac.access.permissions.length, 0)
  assert.equal(typeof f.rbac.auth.error, 'string')
  assert.equal(f.rbac.auth.error.includes(credentials.password), false)
})

test('Django logout calls CSRF and backend logout, clears all access and source', async () => {
  const f = await fixture()
  await f.rbac.auth.loginLocal(credentials)
  await f.rbac.logout()
  assert.equal(f.calls.at(-1).url, '/api/rbac/auth/local/logout')
  assert.equal(f.calls.at(-1).headers.get('X-CSRFToken'), 'csrf-3')
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.rbac.auth.getAccessToken(), undefined)
  assert.equal(f.rbac.access.me, null)
})

test('logout failure still revokes access locally', async () => {
  const f = await fixture()
  await f.rbac.auth.loginLocal(credentials)
  f.fail('/api/rbac/auth/local/logout')
  await assert.rejects(f.rbac.logout())
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.rbac.access.me, null)
})

test('Host Local custom credentials never call the default login API; legacy selection remains valid', async () => {
  const { lib } = await harness()
  const events = []
  const localProvider = lib.createHostLocalProvider({ login: async value => events.push(value.otp), logout: async () => events.push('logout') })
  const rbac = lib.createRbacPlugin({ mode: 'local', localProvider,
    loadAccess: async () => { events.push('me'); return localAccess } })
  await rbac.auth.loginLocal({ otp: '123456' })
  assert.deepEqual(events, ['123456', 'me'])
  await rbac.logout()
  assert.deepEqual(events, ['123456', 'me', 'logout'])
  rbac.auth.setAuthSource('local')
  await rbac.access.loadAccess()
  assert.equal(rbac.access.hasPermission('item.read'), true)
  await rbac.auth.notifyLocalAuthenticated()
  assert.equal(rbac.access.username, 'alice')
})

test('local mode never initializes SSO; sso mode never calls the Local provider', async () => {
  for (const mode of ['local', 'sso']) {
    const f = await fixture(mode)
    await f.rbac.auth.init()
    if (mode === 'local') {
      assert.deepEqual(f.sso.calls, [])
      await assert.rejects(f.rbac.auth.loginSso())
    } else {
      await assert.rejects(f.rbac.auth.loginLocal(credentials))
      assert.deepEqual(f.sso.calls, ['init'])
    }
    assert.equal(f.calls.length, 0)
  }
})

test('Hybrid Local and SSO share /me and do not mix request credentials', async () => {
  const f = await fixture('hybrid')
  await f.rbac.auth.loginLocal(credentials)
  assert.equal(f.calls.at(-1).headers.has('Authorization'), false)
  assert.equal(f.rbac.access.hasPermission('item.read'), true)
  f.respond({ ...localAccess, auth_source: 'sso' })
  await f.rbac.auth.loginSso()
  await f.rbac.access.loadAccess()
  assert.equal(f.calls.at(-1).headers.get('Authorization'), 'Bearer sso-token')
  assert.equal(f.calls.at(-1).withCredentials, undefined)
  assert.equal(f.rbac.auth.source, 'sso')
  assert.equal(f.rbac.access.hasPermission('item.read'), true)
})

test('invalid SSO /me clears token and access, never falls back to Local session', async () => {
  const f = await fixture('hybrid')
  f.rbac.auth.setAuthSource('sso')
  f.fail('/api/rbac/me')
  await assert.rejects(f.rbac.access.loadAccess())
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.rbac.access.me, null)
  assert.equal(f.sso.authenticated, false)
  assert.equal(f.sso.calls.includes('login'), false)
  assert.equal(f.calls.length, 1)
  assert.ok(f.rbac.auth.error)
})

test('Local 401 never calls Keycloak and custom loader 401 also clears source', async () => {
  const f = await fixture('hybrid')
  await f.rbac.auth.loginLocal(credentials)
  f.fail('/api/rbac/me')
  await assert.rejects(f.rbac.access.reloadAccess())
  assert.deepEqual(f.sso.calls, [])
  assert.equal(f.rbac.auth.source, null)
  const custom = f.lib.createRbacPlugin({ mode: 'local', loadAccess: async () => { throw new AxiosError('401', undefined, undefined, undefined, { status: 401 }) } })
  custom.auth.setAuthSource('local')
  await assert.rejects(custom.access.loadAccess())
  assert.equal(custom.auth.source, null)
})

test('explicit page recovery probes Local session and loads /me without logging in', async () => {
  const f = await fixture('hybrid')
  assert.equal(f.rbac.auth.source, null)
  await f.rbac.restoreSession()
  assert.equal(f.rbac.auth.source, 'local')
  assert.equal(f.rbac.access.username, 'alice')
  assert.deepEqual(f.calls.map(c => c.url), ['/api/rbac/auth/local/csrf', '/api/rbac/me'])
  assert.deepEqual(f.sso.calls, [])
})

test('/me server source supersedes cached SSO selection and persists Local', async () => {
  const { lib } = await harness()
  const memory = new Map([['scotec.rbac.auth_source', 'sso']])
  const storage = { getItem: k => memory.get(k), setItem: (k,v) => memory.set(k,v), removeItem: k => memory.delete(k) }
  const rbac = lib.createRbacPlugin({ auth: { mode: 'hybrid', sso: ssoProvider(), storage }, loadAccess: async () => localAccess })
  await rbac.access.loadAccess()
  assert.equal(rbac.auth.source, 'local')
  assert.equal(memory.get('scotec.rbac.auth_source'), 'local')
  assert.equal(rbac.access.hasPermission('item.read'), true)
})

test('all Django endpoints, CSRF names, credentials policy and /me endpoint are configurable', async () => {
  const f = await fixture('local', { withCredentials: false, csrfCookieName: 'customcsrftoken', csrfHeaderName: 'X-Custom-CSRF',
    endpoints: { csrf: '/host/csrf', login: '/host/login', logout: '/host/logout' } })
  await f.rbac.auth.loginLocal(credentials)
  assert.equal(f.calls[1].url, '/host/login')
  assert.equal(f.calls[1].withCredentials, false)
  assert.equal(f.calls[1].xsrfCookieName, 'customcsrftoken')
  assert.equal(f.calls[1].headers.get('X-Custom-CSRF'), 'csrf-1')
  const rbac = f.lib.createRbacPlugin({ mode: 'local', instance: f.client, accessEndpoint: '/custom/me' })
  await rbac.auth.notifyLocalAuthenticated()
  assert.equal(f.calls.at(-1).url, '/custom/me')
})

test('cookie-only CSRF init retains automatic browser XSRF configuration', async () => {
  const f = await fixture()
  f.client.defaults.adapter = async config => {
    f.calls.push(config)
    return { data: config.url.endsWith('/login') ? { authenticated: true } : {}, config, status: 200, headers: {} }
  }
  await f.localProvider.login(credentials)
  assert.equal(f.calls[1].headers.has('X-CSRFToken'), false)
  assert.equal(f.calls[1].withXSRFToken, true)
  assert.equal(f.calls[1].xsrfCookieName, 'csrftoken')
})

test('logout during pending Local login cannot restore permissions from late completion', async () => {
  const { lib } = await harness()
  let finish
  const localProvider = lib.createHostLocalProvider({ login: () => new Promise(resolve => { finish = resolve }), logout() {} })
  const rbac = lib.createRbacPlugin({ mode: 'local', localProvider, loadAccess: async () => localAccess })
  const login = rbac.auth.loginLocal(credentials)
  await rbac.logout()
  finish()
  await assert.rejects(login, /会话已切换/)
  assert.equal(rbac.auth.source, null)
  assert.equal(rbac.access.me, null)
})

test('failed /me after successful Local authentication fails closed', async () => {
  const { lib } = await harness()
  const localProvider = lib.createHostLocalProvider({ login() {}, logout() {} })
  const rbac = lib.createRbacPlugin({ mode: 'local', localProvider, loadAccess: async () => { throw Error('network unavailable') } })
  await assert.rejects(rbac.auth.loginLocal(credentials))
  assert.equal(rbac.auth.source, null)
  assert.equal(rbac.access.me, null)
  assert.ok(rbac.auth.error)
})

test('retrying an SSO request config after Local selection removes the library Bearer', async () => {
  const f = await fixture('hybrid')
  f.rbac.auth.setAuthSource('sso')
  const old = (await f.api.get('/business')).config
  f.rbac.auth.setAuthSource('local')
  await f.api.request(old)
  assert.equal(f.calls.at(-1).headers.has('Authorization'), false)
  await f.api.get('/business', { headers: { Authorization: 'Host local token' } })
  assert.equal(f.calls.at(-1).headers.get('Authorization'), 'Host local token')
})

test('minimal V3 plugin installs Pinia and legacy runtime exports remain available', async () => {
  const { lib } = await harness()
  const rbac = lib.createRbacPlugin({ auth: { mode: 'local', localProvider: lib.createDjangoLocalProvider() } })
  const app = createApp({ render: () => null })
  app.use(rbac)
  assert.equal(app.runWithContext(() => lib.useRbac()), app.runWithContext(() => lib.useRbac()))
  assert.equal(app.runWithContext(() => lib.useAccessStore()), rbac.access)
  for (const name of ['createKeycloakProvider', 'KeycloakAuthProvider', 'AuthenticationError', 'useAccessStore', 'createRbacPlugin', 'useRbac', 'installAuthInterceptor', 'installRbacGuard', 'filterMenus', 'HybridAuthManager', 'createHybridAuthManager', 'createRbacAdminApi', 'createRbacAdminPlugin', 'useRbacAdmin', 'createRbacAdminRoutes', 'createRbacAdminMenu', 'MyAccessView', 'RoleListView', 'RolePermissionMatrixView']) assert.ok(lib[name], name)
  assert.ok(app.directive('permission'))
})

test('restored Django session refreshes HttpOnly/session CSRF before later writes', async () => {
  const f = await fixture()
  await f.rbac.restoreSession()
  await f.api.post('/business', {})
  assert.equal(f.calls.at(-1).headers.get('X-CSRFToken'), 'csrf-1')
})

test('failed callback initialization clears SSO selection without attempting Local', async () => {
  const f = await fixture('hybrid')
  f.rbac.auth.setAuthSource('sso')
  f.sso.initPassive = async () => { throw Error('callback rejected') }
  await assert.rejects(f.rbac.restoreSession())
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.sso.authenticated, false)
  assert.equal(f.calls.length, 0)
})

test('a source change while reconciling /me cannot restore access after logout', async () => {
  const { watch } = await import('vue')
  const f = await fixture('hybrid')
  f.rbac.auth.setAuthSource('sso')
  const stop = watch(() => f.rbac.auth.source, source => {
    if (source === 'local') f.rbac.auth.clearAuthSource()
  }, { flush: 'sync' })
  assert.equal(await f.rbac.access.loadAccess(), null)
  assert.equal(f.rbac.access.me, null)
  stop()
})

test('passive SSO callback with no authenticated user fails closed without Local probe', async () => {
  const f = await fixture('hybrid')
  f.rbac.auth.setAuthSource('sso')
  f.sso.authenticated = false
  await assert.rejects(f.rbac.restoreSession())
  assert.equal(f.rbac.auth.source, null)
  assert.equal(f.calls.length, 0)
  assert.ok(f.rbac.auth.error)
})
