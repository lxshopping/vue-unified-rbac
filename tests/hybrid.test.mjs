import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import axios, { AxiosError } from 'axios'
import { harness } from './helpers/harness.mjs'

function provider() {
  const calls = []
  return { calls, authenticated: true,
    async init() { calls.push('init') }, async initPassive() { calls.push('passive') },
    async login() { calls.push('login') }, async logout() { calls.push('logout') },
    clearToken() { calls.push('clear'); this.authenticated = false },
    isAuthenticated() { return this.authenticated },
    getAccessToken() { calls.push('token'); return 'sso-token' },
    async refreshToken() { calls.push('refresh'); return true },
  }
}
const access = { username: 'local-user', auth_source: 'local', roles: ['admin'], permissions: ['view'] }
async function fixture(mode = 'hybrid', extra = {}) {
  const { lib } = await harness()
  const sso = provider()
  const data = new Map()
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
  const rbac = lib.createRbacPlugin({ pinia: createPinia(), mode, auth: sso,
    hybrid: { storage, ...extra }, loadAccess: async () => ({ ...access, auth_source: rbac.auth.source }) })
  const request = axios.create()
  const configs = []
  request.defaults.adapter = async config => {
    configs.push(config)
    return { data: access, config, status: 200, statusText: 'OK', headers: {} }
  }
  lib.installAuthInterceptor(request, rbac.auth)
  return { lib, sso, rbac, request, configs, storage, data }
}

test('local and hybrid initial state never initialize, refresh, read tokens or login to Keycloak', async () => {
  for (const mode of ['local', 'hybrid']) {
    const f = await fixture(mode)
    await f.rbac.auth.init()
    assert.equal(f.rbac.auth.source, null)
    await f.request.get('/login')
    f.rbac.auth.markLocalAuthenticated()
    await f.rbac.auth.init()
    await f.request.get('/api/rbac/me', { headers: { Authorization: 'Host local credential' } })
    await f.rbac.accessStore.loadAccess()
    assert.equal(f.rbac.accessStore.hasPermission('view'), true)
    assert.equal(f.configs[1].headers.Authorization, 'Host local credential')
    assert.deepEqual(f.sso.calls, [])
  }
})

test('local-only plugin requires no provider, rejects SSO and incompatible sources', async () => {
  const { lib } = await harness()
  const rbac = lib.createRbacPlugin({ pinia: createPinia(), mode: 'local', loadAccess: async () => access })
  await rbac.auth.init()
  await assert.rejects(rbac.accessStore.loadAccess())
  rbac.auth.markLocalAuthenticated()
  await rbac.accessStore.loadAccess()
  await assert.rejects(rbac.auth.loginSso())
  assert.throws(() => rbac.auth.setAuthSource('sso'))
  assert.throws(() => rbac.auth.setAuthSource('unknown'))
  assert.equal(rbac.accessStore.hasPermission('unknown'), false)
})

test('hybrid SSO selection is persisted before passive init and explicit login; bearer follows', async () => {
  const f = await fixture()
  f.sso.initPassive = async () => {
    assert.equal(f.data.get('scotec.rbac.auth_source'), 'sso')
    f.sso.calls.push('passive')
  }
  const login = f.rbac.auth.loginSso()
  assert.equal(login, f.rbac.auth.loginSso())
  await login
  await f.request.get('/api/rbac/me')
  await f.rbac.accessStore.loadAccess()
  assert.deepEqual(f.sso.calls, ['passive', 'login', 'refresh', 'token'])
  assert.equal(f.configs[0].headers.Authorization, 'Bearer sso-token')
  assert.equal(f.rbac.accessStore.hasPermission('view'), true)
})

test('SSO-only retains normal init, token refresh and bearer injection', async () => {
  const f = await fixture('sso')
  await f.rbac.auth.init()
  await f.request.get('/api/rbac/me')
  assert.deepEqual(f.sso.calls, ['init', 'refresh', 'token'])
})

test('Keycloak passive initialization overrides login-required and does not start redirects', async () => {
  const h = await harness()
  const sso = h.lib.createKeycloakProvider({ url: 'https://sso.test', realm: 'test', clientId: 'test', initOptions: { onLoad: 'login-required' } })
  const manager = h.lib.createHybridAuthManager({ mode: 'hybrid', sso, storage: null })
  await manager.init()
  assert.equal(h.keycloak, undefined)
  await manager.loginSso()
  assert.equal(h.keycloak.options.onLoad, undefined)
  assert.equal(h.events.filter(([type]) => type === 'login').length, 1)
  assert.equal(h.keycloak.options.pkceMethod, 'S256')
})

test('local and SSO markers restore across page reload; corrupt/incompatible markers deny', async () => {
  const f = await fixture()
  for (const source of ['local', 'sso']) {
    f.rbac.auth.setAuthSource(source)
    const restored = f.lib.createHybridAuthManager({ mode: 'hybrid', sso: f.sso, storage: f.storage })
    assert.equal(restored.source, source)
    f.sso.calls.length = 0
    await restored.init()
    assert.deepEqual(f.sso.calls, source === 'local' ? [] : ['passive'])
  }
  f.data.set('scotec.rbac.auth_source', 'bad')
  assert.equal(f.rbac.auth.restoreAuthSource(), null)
  f.data.set('scotec.rbac.auth_source', 'sso')
  const local = f.lib.createHybridAuthManager({ mode: 'local', storage: f.storage })
  assert.equal(local.source, null)
})

test('blocked session storage falls back to memory and does not trigger login loops', async () => {
  const broken = { getItem() { throw Error() }, setItem() { throw Error() }, removeItem() { throw Error() } }
  const f = await fixture('hybrid', { storage: broken })
  await f.rbac.auth.init()
  f.rbac.auth.markLocalAuthenticated()
  await f.rbac.accessStore.loadAccess()
  await f.rbac.auth.logout()
  assert.equal(f.rbac.auth.source, null)
  assert.deepEqual(f.sso.calls, [])
})

test('logout invalidates access first, delegates by source and remains denied on failure', async () => {
  let locals = 0
  const f = await fixture('hybrid', { localLogout: () => { locals++; throw Error('host logout failed') } })
  f.rbac.auth.markLocalAuthenticated()
  await f.rbac.accessStore.loadAccess()
  await assert.rejects(f.rbac.auth.logout(), /host logout failed/)
  assert.equal(locals, 1)
  assert.equal(f.rbac.accessStore.me, null)
  assert.equal(f.rbac.auth.source, null)
  assert.deepEqual(f.sso.calls, [])
  f.rbac.auth.setAuthSource('sso')
  await f.rbac.accessStore.loadAccess()
  await f.rbac.logout()
  assert.deepEqual(f.sso.calls, ['logout', 'clear'])
  assert.equal(f.rbac.accessStore.me, null)
})

test('401 dispatches only the matching callback, clears access and never logs in', async () => {
  for (const source of ['local', 'sso']) {
    const errors = []
    const f = await fixture('hybrid', { onAuthError: () => errors.push('sso'), onLocalAuthError: () => errors.push('local') })
    f.rbac.auth.setAuthSource(source)
    await f.rbac.accessStore.loadAccess()
    f.request.defaults.adapter = async config => { throw new AxiosError('401', undefined, config, undefined, { status: 401 }) }
    await Promise.allSettled([f.request.get('/one'), f.request.get('/two')])
    assert.deepEqual(errors, [source])
    assert.equal(f.rbac.auth.source, null)
    assert.equal(f.rbac.accessStore.hasPermission('view'), false)
    assert.equal(f.sso.calls.includes('login'), false)
    assert.equal(f.sso.calls.includes('clear'), source === 'sso')
  }
})

test('late 401 from previous source does not clear the new session', async () => {
  const f = await fixture()
  f.rbac.auth.setAuthSource('sso')
  let reject
  f.request.defaults.adapter = config => new Promise((resolve, fail) => { reject = () => fail(new AxiosError('401', undefined, config, undefined, { status: 401 })) })
  const old = f.request.get('/old')
  while (!reject) await new Promise(resolve => setImmediate(resolve))
  f.rbac.auth.markLocalAuthenticated()
  await f.rbac.accessStore.loadAccess()
  reject()
  await assert.rejects(old)
  assert.equal(f.rbac.auth.source, 'local')
  assert.equal(f.rbac.accessStore.hasPermission('view'), true)
})

test('switching sessions during token refresh prevents dispatch and preserves new access', async () => {
  const f = await fixture()
  f.rbac.auth.setAuthSource('sso')
  let done
  f.sso.refreshToken = () => new Promise(resolve => { done = resolve })
  const old = f.request.get('/old')
  while (!done) await new Promise(resolve => setImmediate(resolve))
  f.rbac.auth.markLocalAuthenticated()
  await f.rbac.accessStore.loadAccess()
  done(true)
  await assert.rejects(old, /会话已切换/)
  assert.equal(f.configs.length, 0)
  assert.equal(f.rbac.accessStore.hasPermission('view'), true)
})

test('same-source login invalidates old pending /me responses', async () => {
  const { lib } = await harness()
  let resolve
  const rbac = lib.createRbacPlugin({ pinia: createPinia(), mode: 'local', loadAccess: () => new Promise(done => { resolve = done }) })
  rbac.auth.markLocalAuthenticated()
  const old = rbac.accessStore.loadAccess()
  await Promise.resolve()
  rbac.auth.markLocalAuthenticated()
  resolve(access)
  assert.equal(await old, null)
  assert.equal(rbac.accessStore.me, null)
})

test('hybrid custom provider without passive capability fails closed', async () => {
  const f = await fixture()
  delete f.sso.initPassive
  await assert.rejects(f.rbac.auth.loginSso(), /initPassive/)
  assert.equal(f.rbac.auth.source, null)
  assert.deepEqual(f.sso.calls, [])
})

test('SSO refresh failure clears the unified access state and never dispatches', async () => {
  const errors = []
  const f = await fixture('sso', { onAuthError: () => errors.push('sso') })
  await f.rbac.accessStore.loadAccess()
  f.sso.refreshToken = async () => { throw Error('expired') }
  await assert.rejects(f.request.get('/me'), /expired/)
  assert.equal(f.configs.length, 0)
  assert.equal(f.rbac.accessStore.me, null)
  assert.equal(f.rbac.auth.source, null)
  assert.deepEqual(errors, ['sso'])
})

test('provider token cleanup failure still clears permissions and source', async () => {
  const f = await fixture('sso')
  await f.rbac.accessStore.loadAccess()
  f.sso.clearToken = () => { throw Error('cleanup failed') }
  await assert.rejects(f.rbac.auth.handleAuthError(Error('expired')), /cleanup failed/)
  assert.equal(f.rbac.accessStore.me, null)
  assert.equal(f.rbac.auth.source, null)
})

test('manager interceptor eject removes request and response handling', async () => {
  const f = await fixture('sso')
  const client = axios.create()
  const eject = f.lib.installAuthInterceptor(client, f.rbac.auth)
  eject()
  client.defaults.adapter = async config => {
    assert.equal(config.headers.has('Authorization'), false)
    throw new AxiosError('401', undefined, config, undefined, { status: 401 })
  }
  await f.rbac.accessStore.loadAccess()
  await assert.rejects(client.get('/old'))
  assert.equal(f.rbac.auth.source, 'sso')
  assert.equal(f.rbac.accessStore.hasPermission('view'), true)
})
