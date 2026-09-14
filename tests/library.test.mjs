import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as vue from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import axios from 'axios'
import { createRouter, createMemoryHistory } from 'vue-router'
import { harness } from './helpers/harness.mjs'

const access = (permissions = ['test.item.read']) => ({ roles: ['admin'], permissions })
function provider() {
  return {
    authenticated: true,
    async init() {},
    isAuthenticated() { return this.authenticated },
    async login() {},
    async logout() { this.authenticated = false },
    getAccessToken() { return this.authenticated ? 'memory-token' : undefined },
    async refreshToken() { return false },
  }
}
async function fixture(loadAccess = async () => access()) {
  const h = await harness()
  const pinia = createPinia()
  const auth = provider()
  const rbac = h.lib.createRbacPlugin({ pinia, auth, loadAccess })
  return { ...h, pinia, auth, rbac, store: rbac.accessStore }
}
function routerFor(routes) {
  return createRouter({
    history: createMemoryHistory(),
    routes: routes.map(route => ({ component: { render: () => null }, ...route })),
  })
}

test('custom providers and host Pinia instances keep loaders, state and injection isolated', async () => {
  const h = await fixture()
  const otherPinia = createPinia()
  const other = h.lib.createRbacPlugin({
    pinia: otherPinia, auth: provider(), loadAccess: async () => access(['test.item.write']),
  })
  await Promise.all([h.store.loadMyAccess(), other.accessStore.loadMyAccess()])
  assert.equal(h.store.hasPermission('test.item.read'), true)
  assert.equal(h.store.hasPermission('test.item.write'), false)
  assert.equal(other.accessStore.hasPermission('test.item.read'), false)
  assert.equal(h.lib.useAccessStore(h.pinia), h.store)
  setActivePinia(otherPinia)
  assert.equal(h.lib.useAccessStore(), other.accessStore)
  const app = vue.createApp({ render: () => null })
  app.use(h.pinia)
  app.use(h.rbac)
  assert.ok(app.directive('permission'))
  assert.equal(app.runWithContext(() => h.lib.useRbac()).accessStore, h.store)
  assert.equal(app.runWithContext(() => h.lib.useAccessStore()), h.store)
  assert.throws(() => h.lib.useAccessStore(createPinia()), /createRbacPlugin/)
  assert.throws(() => h.lib.createRbacPlugin({
    pinia: h.pinia, auth: provider(), loadAccess: async () => access(),
  }), /复用/)
})

test('default deny rejects invalid codes, empty sets and role-based grants', async () => {
  const h = await fixture()
  assert.equal(h.store.hasPermission('test.item.read'), false)
  await h.store.loadMyAccess()
  for (const code of ['', ' ', undefined, null, [], 123, 'test.item.write']) {
    assert.equal(h.store.hasPermission(code), false)
  }
  assert.equal(h.store.hasPermission('test.item.read'), true)
  assert.equal(h.store.hasAllPermissions([]), false)
  assert.equal(h.store.hasAllPermissions(new Array(1)), false)
  assert.equal(h.store.hasAllPermissions(['test.item.read', 'test.item.write']), false)
  assert.equal(h.store.hasAnyPermission([]), false)
  assert.equal(h.store.hasAnyPermission(['test.item.read', 'test.item.write']), true)
  h.auth.authenticated = false
  assert.equal(h.store.hasPermission('test.item.read'), false)
})

test('malformed access responses fail closed; optional metadata and camelCase remain compatible', async () => {
  for (const data of [null, {}, { roles: [], permissions: 'test.item.read' },
    { roles: ['admin'], permissions: ['test.item.read', 42] },
    { roles: [], permissions: new Array(1) }]) {
    const h = await fixture(async () => data)
    await assert.rejects(h.store.loadMyAccess())
    assert.equal(h.store.loaded, true)
    assert.equal(h.store.me, null)
    assert.equal(h.store.hasPermission('test.item.read'), false)
  }
  const h = await fixture(async () => ({ ...access(), authSource: 'custom', username: 'consumer' }))
  await h.store.loadMyAccess()
  assert.equal(h.store.authSource, 'custom')
  assert.equal(h.store.username, 'consumer')
})

test('clear and reload discard older in-flight permissions without disturbing the new load', async () => {
  const resolvers = []
  const h = await fixture(() => new Promise(resolve => resolvers.push(resolve)))
  const old = h.store.loadMyAccess()
  assert.equal(old, h.store.loadMyAccess())
  await Promise.resolve()
  h.store.clearAccess()
  const fresh = h.store.reloadAccess()
  await Promise.resolve()
  resolvers[0](access(['test.old.read']))
  assert.equal(await old, null)
  assert.equal(h.store.loading, true)
  assert.equal(h.store.loaded, false)
  resolvers[1](access(['test.new.read']))
  await fresh
  assert.equal(h.store.hasPermission('test.old.read'), false)
  assert.equal(h.store.hasPermission('test.new.read'), true)
})

test('synchronous loader failure can retry; pending loads and failed reloads deny old access', async () => {
  let fail = false
  const h = await fixture(() => {
    if (fail) throw new Error('loader failed')
    return Promise.resolve(access())
  })
  await h.store.loadMyAccess()
  fail = true
  const reload = h.store.reloadAccess()
  assert.equal(h.store.hasPermission('test.item.read'), false)
  await assert.rejects(reload)
  assert.equal(h.store.loading, false)
  assert.equal(h.store.hasPermission('test.item.read'), false)
  fail = false
  await h.store.reloadAccess()
  assert.equal(h.store.hasPermission('test.item.read'), true)
})

test('plugin logout clears current and pending permissions before provider logout', async () => {
  const h = await fixture()
  await h.store.loadMyAccess()
  h.auth.logout = async () => {
    assert.equal(h.store.me, null)
    throw new Error('logout unavailable')
  }
  await assert.rejects(h.rbac.logout(), /logout unavailable/)
  assert.equal(h.store.hasPermission('test.item.read'), false)
})

test('request interceptor preserves host config and responses and can be ejected', async () => {
  const h = await fixture()
  const client = axios.create({ baseURL: '/host-api', timeout: 2345, headers: { 'X-Host': 'kept' } })
  const configs = []
  client.defaults.adapter = async config => {
    configs.push(config)
    return { data: { fromHost: true }, config, status: 200, statusText: 'OK', headers: {} }
  }
  client.interceptors.response.use(response => ({ ...response, data: { ...response.data, handled: true } }))
  let refreshed = false
  h.auth.refreshToken = async seconds => {
    assert.equal(seconds, 45)
    await Promise.resolve()
    refreshed = true
    return true
  }
  h.auth.getAccessToken = () => {
    assert.equal(refreshed, true)
    return 'new-memory-token'
  }
  const eject = h.lib.installAuthInterceptor(client, h.auth, { minValidity: 45 })
  assert.equal((await client.get('/permission-data')).data.handled, true)
  assert.equal(configs[0].baseURL, '/host-api')
  assert.equal(configs[0].timeout, 2345)
  assert.equal(configs[0].headers.get('X-Host'), 'kept')
  assert.equal(configs[0].headers.get('Authorization'), 'Bearer new-memory-token')
  eject()
  await client.get('/public')
  assert.equal(configs[1].headers.has('Authorization'), false)
})

test('refresh rejection never dispatches a request even when host onAuthError resolves', async () => {
  const h = await fixture()
  const client = axios.create()
  let sent = false
  let errors = 0
  client.defaults.adapter = async () => { sent = true; throw new Error('unexpected dispatch') }
  h.auth.refreshToken = async () => { throw new Error('refresh failed') }
  h.lib.installAuthInterceptor(client, h.auth, { onAuthError: () => { errors++ } })
  await assert.rejects(client.get('/protected'), /refresh failed/)
  assert.equal(sent, false)
  assert.equal(errors, 1)
})

test('guard accepts custom metadata, waits for access, denies invalid metadata and uninstalls', async () => {
  let calls = 0
  const h = await fixture(async () => { calls++; return access() })
  const router = routerFor([
    { path: '/' }, { path: '/denied', name: 'denied' },
    { path: '/read', meta: { capability: 'test.item.read' } },
    { path: '/empty', meta: { capability: '' } },
    { path: '/invalid', meta: { capability: ['test.item.read'] } },
    { path: '/missing', meta: { capability: 'test.item.write' } },
  ])
  const remove = h.lib.installRbacGuard(router, {
    accessStore: h.store, permissionMetaKey: 'capability', forbiddenRoute: { name: 'denied' },
  })
  await router.push('/')
  assert.equal(calls, 0)
  await router.push('/read')
  assert.equal(router.currentRoute.value.path, '/read')
  for (const route of ['/empty', '/invalid', '/missing']) {
    await router.push(route)
    assert.equal(router.currentRoute.value.path, '/denied')
  }
  assert.equal(calls, 1)
  remove()
  await router.push('/missing')
  assert.equal(router.currentRoute.value.path, '/missing')
})

test('guard cancels a protected forbidden destination instead of looping or granting access', async () => {
  const h = await fixture(async () => access([]))
  const router = routerFor([
    { path: '/' },
    { path: '/private', meta: { permission: 'test.item.read' } },
    { path: '/denied', name: 'denied', alias: '/forbidden', meta: { permission: 'test.item.read' } },
  ])
  h.lib.installRbacGuard(router, { accessStore: h.store, forbiddenRoute: { name: 'denied' } })
  await router.push('/')
  await router.push('/private')
  assert.equal(router.currentRoute.value.path, '/')
  await router.push('/forbidden')
  assert.equal(router.currentRoute.value.path, '/')
})

test('generic guard denies load errors without retries until explicit reload', async () => {
  let calls = 0
  const h = await fixture(async () => { calls++; throw new Error('offline') })
  const router = routerFor([{ path: '/' }, { path: '/403' },
    { path: '/private', meta: { permission: 'test.item.read' } }])
  h.lib.installRbacGuard(router, { accessStore: h.store })
  await router.push('/private')
  assert.equal(router.currentRoute.value.path, '/403')
  await router.push('/private')
  assert.equal(calls, 1)
})

test('menu filtering preserves host fields, recursively removes empty parents, and does not mutate input', async () => {
  const h = await fixture()
  await h.store.loadMyAccess()
  const menus = [
    { title: 'public', icon: 'home' },
    { title: 'parent', children: [
      { title: 'read', permission: 'test.item.read', extra: 123 },
      { title: 'write', permission: 'test.item.write' },
    ] },
    { title: 'empty', children: [{ permission: 'test.item.write' }] },
    { title: 'invalid', permission: '' },
    { title: 'undefined', permission: undefined },
    { title: 'null', permission: null },
  ]
  const before = structuredClone(menus)
  const filtered = h.lib.filterMenus(menus, h.store.hasPermission)
  assert.deepEqual(Array.from(filtered, item => item.title), ['public', 'parent'])
  assert.equal(filtered[0].icon, 'home')
  assert.equal(filtered[1].children[0].extra, 123)
  assert.equal(filtered[1].children.length, 1)
  assert.notEqual(filtered[0], menus[0])
  assert.deepEqual(menus, before)
})

test('registered directive reacts to loading, permission changes, invalid bindings and cleanup', async () => {
  const h = await fixture()
  const app = vue.createApp({ render: () => null })
  app.use(h.pinia)
  app.use(h.rbac)
  const directive = app.directive('permission')
  const document = { createComment: text => ({ text, parentNode: null }) }
  const el = { ownerDocument: document, parentNode: null }
  const parent = {
    child: el,
    replaceChild(next, previous) {
      assert.equal(this.child, previous)
      previous.parentNode = null
      next.parentNode = this
      this.child = next
    },
  }
  el.parentNode = parent
  directive.mounted(el, { value: 'test.item.read' })
  assert.notEqual(parent.child, el)
  await h.store.loadMyAccess()
  assert.equal(parent.child, el)
  directive.updated(el, { value: ['test.item.read'] })
  assert.notEqual(parent.child, el)
  directive.updated(el, { value: 'test.item.read' })
  assert.equal(parent.child, el)
  h.store.clearAccess()
  assert.notEqual(parent.child, el)
  directive.beforeUnmount(el)
  assert.equal(parent.child, el)
  await h.store.loadMyAccess()
  h.store.clearAccess()
  assert.equal(parent.child, el)
})

test('Keycloak providers isolate SDK instances and preserve code flow plus PKCE under custom options', async () => {
  const h = await harness()
  await h.auth.auth.init()
  const firstSdk = h.keycloak
  const second = h.lib.createKeycloakProvider({
    url: 'https://identity.example.test', realm: 'other', clientId: 'consumer',
    initOptions: { flow: 'implicit', pkceMethod: false, checkLoginIframe: true },
  })
  const initialization = second.init()
  assert.equal(second.init(), initialization)
  await initialization
  assert.notEqual(h.keycloak, firstSdk)
  assert.equal(h.keycloak.config.realm, 'other')
  assert.equal(h.keycloak.options.flow, 'standard')
  assert.equal(h.keycloak.options.pkceMethod, 'S256')
  assert.equal(h.keycloak.options.checkLoginIframe, true)
  h.keycloak.token = 'second-provider-token'
  assert.equal(second.getAccessToken(), 'second-provider-token')
  assert.equal(h.auth.auth.getAccessToken(), 'test-access-token')
})
