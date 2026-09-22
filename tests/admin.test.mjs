import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import axios from 'axios'
import { harness } from './helpers/harness.mjs'
import { mountView, flush } from './helpers/renderer.mjs'

const permissions = { roleView: 'host.roles.read', roleManage: 'host.roles.write', meView: 'host.me.read' }
const allPermissions = Object.values(permissions)
const role = { code: 'operator', name: 'Operator', active: true, permissionCount: 1, description: 'Operations' }
function fakeApi() {
  return {
    supportsUpdates: true,
    async listRoles() { return [role] },
    async listPermissions() { return [{ code: 'deploy', name: 'Deploy' }] },
    async getRolePermissions() { return ['deploy', 'unlisted.code'] },
    async updateRolePermissions() {},
    async getMyAccess() { throw Error('MyAccessView must use AccessStore') },
  }
}
async function fixture(view, { api = fakeApi(), codes = allPermissions, editable = true } = {}) {
  const h = await harness()
  const pinia = createPinia()
  let failMe = false
  const rbac = h.lib.createRbacPlugin({ pinia, mode: 'local', loadAccess: async () => {
    if (failMe) throw Error('me failed')
    return { username: 'user', auth_source: 'local', roles: ['operator'], permissions: codes }
  } })
  rbac.auth.markLocalAuthenticated()
  await rbac.accessStore.loadAccess()
  const component = (await h.load('src/lib/admin/views/' + view + '.ts')).default
  const ui = mountView(component, [pinia, rbac, h.lib.createRbacAdminPlugin({ api, permissions, editable })])
  return { ...h, api, rbac, ui, failMe: () => { failMe = true } }
}

test('HTTP admin API uses configured endpoints, safely encoded role URLs, methods and adapters', async () => {
  const { lib } = await harness()
  const request = axios.create()
  const sent = []
  request.defaults.adapter = async config => {
    sent.push(config)
    const data = config.url === '/roles' ? { results: [role] }
      : config.url === '/permissions' ? [{ code: 'deploy' }]
      : config.url === '/api/rbac/me' ? { username: 'u', roles: [], permissions: [] }
      : ['deploy']
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  const api = lib.createRbacAdminApi(request, { endpoints: {
    roles: '/roles', permissions: '/permissions', rolePermissions: code => '/roles/' + encodeURIComponent(code),
    updateRolePermissions: code => '/grants/' + encodeURIComponent(code),
  }, updateMethod: 'patch', adapters: { roles: data => data.results, updateBody: codes => ({ codes }) } })
  assert.equal((await api.listRoles())[0].code, role.code)
  assert.equal((await api.listPermissions())[0].code, 'deploy')
  assert.equal((await api.getRolePermissions('a/b'))[0], 'deploy')
  await api.updateRolePermissions('a/b', ['deploy'])
  assert.equal((await api.getMyAccess()).username, 'u')
  assert.equal(sent[2].url, '/roles/a%2Fb')
  assert.equal(sent[3].url, '/grants/a%2Fb')
  assert.equal(sent[3].method, 'patch')
  assert.deepEqual(JSON.parse(sent[3].data), { codes: ['deploy'] })
  assert.equal(sent[4].url, '/api/rbac/me')
})

test('HTTP admin API is read-only without update endpoint, rejects malformed catalogues and access', async () => {
  const { lib } = await harness()
  const request = axios.create()
  let data = [{}]
  let calls = 0
  request.defaults.adapter = async config => { calls++; return { config, data, status: 200, statusText: 'OK', headers: {} } }
  const api = lib.createRbacAdminApi(request, { endpoints: { roles: '/r', permissions: '/p', rolePermissions: () => '/rp' } })
  assert.equal(api.supportsUpdates, false)
  await assert.rejects(api.updateRolePermissions('r', []), /read-only/)
  assert.equal(calls, 0)
  for (const method of ['listRoles', 'listPermissions', 'getRolePermissions', 'getMyAccess']) await assert.rejects(api[method]('r'))
  data = [role, role]
  await assert.rejects(api.listRoles(), /Duplicate/)
  data = [{ ...role, active: 'yes' }]
  await assert.rejects(api.listRoles(), /metadata/)
  request.defaults.adapter = async () => { throw Error('offline') }
  await assert.rejects(api.listPermissions(), /offline/)
})

test('admin route and menu helpers require explicit permission codes and support custom paths/meta', async () => {
  const { lib } = await harness()
  assert.throws(() => lib.createRbacAdminRoutes({ permissions: {} }), /Configure/)
  const routes = lib.createRbacAdminRoutes({ permissions, basePath: '/settings/rbac/', namePrefix: 'settings', permissionMetaKey: 'capability' })
  assert.deepEqual(Array.from(routes, r => r.path), ['/settings/rbac/roles', '/settings/rbac/role-permissions', '/settings/rbac/me'])
  assert.equal(routes[0].meta.capability, permissions.roleView)
  assert.equal(routes[2].meta.capability, permissions.meView)
  assert.equal(typeof routes[0].component, 'function')
  assert.equal(lib.createRbacAdminMenu({ permissions })[0].permission, permissions.roleView)
  const pinia = createPinia()
  const rbac = lib.createRbacPlugin({ pinia, mode: 'local', loadAccess: async () => ({ roles: [], permissions: [] }) })
  rbac.auth.markLocalAuthenticated()
  const router = createRouter({ history: createMemoryHistory(), routes: [
    ...routes.map(route => ({ ...route, component: { render: () => null } })),
    { path: '/403', component: { render: () => null } },
  ] })
  lib.installRbacGuard(router, { accessStore: rbac.accessStore, permissionMetaKey: 'capability' })
  await router.push('/settings/rbac/roles')
  assert.equal(router.currentRoute.value.path, '/403')
})

test('RoleListView renders loading, success, empty, error and reload using the API abstraction', async () => {
  const api = fakeApi()
  let resolve
  api.listRoles = () => new Promise(done => { resolve = done })
  const f = await fixture('RoleListView', { api })
  assert.match(f.ui.text(), /正在加载/)
  resolve([role])
  await flush()
  assert.match(f.ui.text(), /operator/)
  assert.match(f.ui.text(), /Operations/)
  api.listRoles = async () => []
  await f.ui.click('重新加载')
  assert.match(f.ui.text(), /暂无角色/)
  api.listRoles = async () => { throw Error('API failed') }
  await f.ui.click('重新加载')
  assert.match(f.ui.text(), /加载失败/)
  assert.doesNotMatch(f.ui.text(), /Operations/)
  assert.equal(f.rbac.accessStore.hasPermission('unknown'), false)
  api.listRoles = async () => [role]
  await f.ui.click('重新加载')
  assert.match(f.ui.text(), /Operations/)
  f.ui.app.unmount()
})

test('admin views deny missing permissions even when mounted without a router guard', async () => {
  for (const view of ['RoleListView', 'RolePermissionMatrixView', 'MyAccessView']) {
    const api = fakeApi()
    let called = false
    api.listRoles = async () => { called = true; return [role] }
    const f = await fixture(view, { api, codes: [] })
    await flush()
    assert.match(f.ui.text(), /权限不足/)
    assert.equal(called, false)
    assert.equal(f.ui.all('table').length, 0)
    f.ui.app.unmount()
  }
})

test('pending admin results cannot reappear after logout', async () => {
  const api = fakeApi()
  let resolve
  api.listRoles = () => new Promise(done => { resolve = done })
  const f = await fixture('RoleListView', { api })
  await f.rbac.logout()
  resolve([role])
  await flush()
  assert.match(f.ui.text(), /权限不足/)
  assert.doesNotMatch(f.ui.text(), /Operations/)
  f.ui.app.unmount()
})

test('matrix edit requires host opt-in, API capability and manage permission', async () => {
  for (const options of [{ editable: false }, { codes: [permissions.roleView] }, { api: { ...fakeApi(), supportsUpdates: false } }]) {
    const f = await fixture('RolePermissionMatrixView', options)
    await flush()
    assert.match(f.ui.text(), /只读模式/)
    assert.equal(f.ui.all('input').length, 0)
    assert.equal(f.ui.all('button').filter(b => b.text.startsWith('保存')).length, 0)
    assert.match(f.ui.text(), /✓/)
    f.ui.app.unmount()
  }
})

test('matrix saves changes, preserves unlisted grants, disables edits and reloads server + current access', async () => {
  const api = fakeApi()
  let saved, finish
  let reads = 0
  api.getRolePermissions = async () => { reads++; return saved ?? ['deploy', 'unlisted.code'] }
  api.updateRolePermissions = (code, codes) => { assert.equal(code, role.code); saved = codes; return new Promise(resolve => { finish = resolve }) }
  const f = await fixture('RolePermissionMatrixView', { api })
  await flush()
  f.ui.all('input')[0].props.onChange({ target: { checked: false } })
  const saving = f.ui.click('保存 operator')
  await flush()
  assert.equal(f.ui.all('input')[0].props.disabled, true)
  assert.match(f.ui.text(), /正在保存/)
  assert.deepEqual(Array.from(saved), ['unlisted.code'])
  finish()
  await saving
  assert.match(f.ui.text(), /保存成功/)
  assert.equal(f.ui.all('input')[0].props.checked, false)
  assert.ok(reads >= 2)
  f.ui.app.unmount()
})

test('matrix failure restores server values and reports error; reload error does not leave editable stale data', async () => {
  const api = fakeApi()
  api.updateRolePermissions = async () => { throw Error('write failed') }
  const f = await fixture('RolePermissionMatrixView', { api })
  await flush()
  f.ui.all('input')[0].props.onChange({ target: { checked: false } })
  await f.ui.click('保存 operator')
  assert.match(f.ui.text(), /失败/)
  assert.equal(f.ui.all('input')[0].props.checked, true)
  api.listRoles = async () => { throw Error('offline') }
  await f.ui.click('重新加载')
  assert.equal(f.ui.all('input').length, 0)
  assert.match(f.ui.text(), /加载失败/)
  f.ui.app.unmount()
})

test('matrix empty and API error states fail closed', async () => {
  const api = fakeApi()
  api.listPermissions = async () => []
  const f = await fixture('RolePermissionMatrixView', { api })
  await flush()
  assert.match(f.ui.text(), /暂无角色或权限/)
  api.listPermissions = async () => { throw Error('failed') }
  await f.ui.click('重新加载')
  assert.match(f.ui.text(), /加载失败/)
  assert.equal(f.ui.all('input').length, 0)
  f.ui.app.unmount()
})

test('MyAccessView uses only AccessStore and failed /me refresh removes displayed access', async () => {
  const f = await fixture('MyAccessView')
  assert.match(f.ui.text(), /用户名 user/)
  assert.match(f.ui.text(), /认证来源 local/)
  f.failMe()
  await f.ui.click('刷新权限')
  assert.match(f.ui.text(), /加载失败/)
  assert.doesNotMatch(f.ui.text(), /用户名 user/)
  assert.equal(f.rbac.accessStore.hasPermission(permissions.meView), false)
  f.ui.app.unmount()
})

test('matrix distinguishes successful write from failed server reload', async () => {
  const api = fakeApi()
  api.updateRolePermissions = async () => {
    api.listRoles = async () => { throw Error('reload failed') }
  }
  const f = await fixture('RolePermissionMatrixView', { api })
  await flush()
  await f.ui.click('保存 operator')
  assert.doesNotMatch(f.ui.text(), /保存成功/)
  assert.match(f.ui.text(), /加载失败/)
  assert.equal(f.ui.all('input').length, 0)
  f.ui.app.unmount()
})

test('matrix successful write followed by failed /me revokes authorization', async () => {
  const f = await fixture('RolePermissionMatrixView')
  await flush()
  f.failMe()
  await f.ui.click('保存 operator')
  assert.match(f.ui.text(), /权限不足/)
  assert.equal(f.rbac.accessStore.hasPermission(permissions.roleManage), false)
  assert.equal(f.ui.all('input').length, 0)
  f.ui.app.unmount()
})


test('transposed matrix saves the selected role column without changing another role', async () => {
  const api = fakeApi()
  let saved
  api.listRoles = async () => [role, { code: 'viewer' }]
  api.listPermissions = async () => [{ code: 'deploy' }, { code: 'read' }]
  api.getRolePermissions = async code => code === 'operator' ? ['deploy', 'unlisted.code'] : ['read']
  api.updateRolePermissions = async (code, codes) => { saved = { code, codes: Array.from(codes) } }
  const f = await fixture('RolePermissionMatrixView', { api })
  await flush()
  const inputs = f.ui.all('input')
  assert.deepEqual(inputs.map(input => input.props['aria-label']), ['operator: deploy', 'viewer: deploy', 'operator: read', 'viewer: read'])
  inputs[1].props.onChange({ target: { checked: true } })
  await f.ui.click('保存 viewer')
  assert.deepEqual(saved, { code: 'viewer', codes: ['read', 'deploy'] })
  assert.equal(f.ui.all('input')[0].props.checked, true)
  f.ui.app.unmount()
})
