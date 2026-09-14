import assert from 'node:assert/strict'
import { test } from 'node:test'
import { harness, me, environment } from './helpers/harness.mjs'

const logins = (h) => h.events.filter(([event]) => event === 'login')
const requests = (h) => h.events.filter(([event]) => event === 'request')

test('initialization is shared, uses code flow and PKCE, keeps tokens out of storage', async () => {
  const h = await harness()
  const first = h.auth.auth.init()
  assert.equal(first, h.auth.auth.init())
  assert.equal(await first, undefined)
  assert.equal(h.keycloak.options.flow, 'standard')
  assert.equal(h.keycloak.options.pkceMethod, 'S256')
  assert.equal(h.keycloak.options.checkLoginIframe, false)
  assert.equal(h.keycloak.config.realm, 'ops')
  assert.equal(h.auth.auth.getAccessToken(), 'test-access-token')
  assert.equal(h.storage.size, 0)
})

test('missing SSO configuration rejects initialization clearly', async () => {
  const h = await harness({ env: { ...environment, VITE_KEYCLOAK_REALM: '' } })
  await assert.rejects(h.auth.auth.init(), /缺少 Keycloak 配置/)
})

test('Axios waits for refresh and uses the new token for a token-free business API', async () => {
  const h = await harness()
  await h.auth.auth.init()
  h.keycloak.updateToken = async (seconds) => {
    assert.equal(seconds, 30)
    await new Promise((resolve) => setTimeout(resolve, 5))
    h.keycloak.token = 'refreshed-test-token'
  }
  const { fetchMyAccess } = await h.load('src/demo/api/rbac.ts')
  const result = await fetchMyAccess()
  assert.equal(result.username, 'test-user')
  assert.equal(requests(h)[0][2], 'Bearer refreshed-test-token')
  assert.equal(h.storage.size, 0)
})

test('simultaneous 401 failures start only one login and invalidate permissions', async () => {
  const h = await harness()
  await h.auth.auth.init()
  await h.store.loadMyAccess()
  h.respond(401)
  await Promise.allSettled([h.request.get('/one'), h.request.get('/two')])
  assert.equal(logins(h).length, 1)
  assert.equal(logins(h)[0][1].prompt, 'login')
  assert.equal(h.store.hasPermission('demo.order.view'), false)
  assert.equal(h.store.me, null)
  assert.equal(h.auth.auth.isAuthenticated(), false)
  assert.deepEqual([...h.storage.values()], ['1'])
})

test('relogin flag survives a full redirect, F5, and successful me before another API 401', async () => {
  const storage = new Map()
  const first = await harness({ storage })
  await first.auth.auth.init()
  first.respond(401)
  await assert.rejects(first.request.get('/rbac/me'))
  assert.equal(logins(first).length, 1)
  for (let reload = 0; reload < 2; reload++) {
    const next = await harness({ storage })
    await next.auth.auth.init()
    await next.store.loadMyAccess()
    next.respond(401)
    await assert.rejects(next.request.get('/business'), /停止自动重登/)
    assert.equal(logins(next).length, 0)
  }
})

test('SDK refresh failure cannot bypass login guard or send the old token', async () => {
  const h = await harness({ storage: new Map([['rbac.sso.relogin-attempted', '1']]) })
  await h.auth.auth.init()
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
    await h.auth.auth.init()
    h.keycloak.authenticated = !unauthenticated
    h.keycloak.token = undefined
    await assert.rejects(h.request.get('/rbac/me'))
    assert.equal(logins(h).length, 1)
    assert.equal(requests(h).length, 0)
  }
})

test('blocked session storage stops automatic redirect but permits explicit login', async () => {
  const h = await harness({ storageBlocked: true })
  await h.auth.auth.init()
  h.respond(401)
  await assert.rejects(h.request.get('/rbac/me'), /无法保存重登标记/)
  assert.equal(logins(h).length, 0)
  await h.auth.login()
  assert.equal(logins(h).length, 1)
})

test('403 is passed to business callers without reauthentication or loss of me', async () => {
  const h = await harness()
  await h.auth.auth.init()
  await h.store.loadMyAccess()
  h.respond(403)
  await assert.rejects(h.request.get('/business'), (error) => error.response.status === 403)
  assert.equal(logins(h).length, 0)
  assert.equal(h.store.hasPermission('demo.order.view'), true)
  assert.equal(h.auth.authenticationError.value, null)
})

test('public routes never load permissions; protected navigation shares and caches me', async () => {
  const h = await harness()
  await h.auth.auth.init()
  const router = (await h.load('src/demo/router/index.ts')).default
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
  await h.auth.auth.init()
  h.respond(200, me([]))
  const router = (await h.load('src/demo/router/index.ts')).default
  await router.push('/release/orders')
  assert.equal(router.currentRoute.value.path, '/403')
  assert.equal(h.store.hasPermission('demo.order.view'), false)
  assert.equal(requests(h).length, 1)
})

test('me failure stays out of 403 and does not repeatedly load or login on navigation', async () => {
  for (const status of [401, 403, 500]) {
    const h = await harness({ storage: new Map([['rbac.sso.relogin-attempted', '1']]) })
    await h.auth.auth.init()
    h.respond(status)
    const router = (await h.load('src/demo/router/index.ts')).default
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
  await h.auth.auth.init()
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
  await h.auth.auth.init()
  await h.auth.logout()
  const event = h.events.find(([name]) => name === 'logout')
  assert.equal(event[1].redirectUri, 'http://127.0.0.1:8080')
  assert.equal(storage.has('rbac.sso.relogin-attempted'), false)
  assert.equal(storage.get('unrelated'), 'keep')
})
