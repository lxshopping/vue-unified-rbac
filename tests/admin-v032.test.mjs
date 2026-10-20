import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import { defineComponent, h as vnode, ref, KeepAlive } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import axios from 'axios'
import { harness } from './helpers/harness.mjs'
import { mountView, flush } from './helpers/renderer.mjs'

const permissions = { roleView: 'rbac.role.view', rolePermissionView: 'rbac.role_permission.view',
  rolePermissionUpdate: 'rbac.role_permission.update', permissionView: 'rbac.permission.view' }
const all = [...Object.values(permissions), 'rbac.role.create', 'rbac.role.update', 'rbac.role.delete', 'rbac.user_role.view', 'rbac.user_role.update']
const role = { id: 12, code: 'operator', name: 'Operator', active: true }
const user = { id: 'custom-user-id', username: 'admin@example.test', roles: ['operator'], active: true, authSource: 'local', roleSource: 'rbac_db' }
function fakeApi() {
  let roles = [role, { id: 1, code: 'rbac_admin', name: 'Admin', active: true, protected: true }]
  let assigned = ['operator']
  const calls = []
  return {
    calls, supportsUpdates: true,
    async listRoles() { calls.push(['listRoles']); return roles.map(v => ({ ...v })) },
    async createRole(data) { calls.push(['create', { ...data }]); roles.push({ ...data, id: 13 }) },
    async updateRole(id, data) { calls.push(['update', id, { ...data }]); roles = roles.map(v => v.id === id ? { ...v, ...data } : v) },
    async deleteRole(id) { calls.push(['delete', id]); roles = roles.filter(v => v.id !== id) },
    async listPermissions() { return [{ code: 'deploy' }] },
    async getRolePermissions() { return [] },
    async updateRolePermissions() {},
    async listLocalUsers() { calls.push(['listUsers']); return [{ ...user, roles: [...assigned] }] },
    async getLocalUserRoles(id) { calls.push(['getRoles', id]); return [...assigned] },
    async updateLocalUserRoles(id, codes) { calls.push(['setRoles', id, [...codes]]); assigned = [...codes] },
    async getMyAccess() { throw Error('Use AccessStore') },
  }
}
async function fixture(view, { api = fakeApi(), codes = all, editable = true, source = 'local', roleSource = 'rbac_db', permissionOptions = permissions } = {}) {
  const h = await harness()
  const pinia = createPinia()
  let granted = [...codes]
  const rbac = h.lib.createRbacPlugin({ pinia, mode: source === 'sso' ? 'sso' : 'local',
    ...(source === 'sso' ? { auth: h.auth.auth } : {}),
    loadAccess: async () => ({ username: 'admin', auth_source: source, role_source: roleSource, roles: ['operator'], permissions: granted }) })
  if (source === 'sso') await rbac.auth.init()
  else rbac.auth.markLocalAuthenticated()
  await rbac.accessStore.loadAccess()
  const component = (await h.load('src/lib/admin/views/' + view + '.ts')).default
  const ui = mountView(component, [pinia, rbac, h.lib.createRbacAdminPlugin({ api, permissions: permissionOptions, editable })])
  await flush()
  return { ...h, api, rbac, ui, async grant(next) { granted = next; await rbac.accessStore.reloadAccess(); await flush() } }
}
function input(ui, label, value) {
  const node = ui.all('input').find(v => v.props['aria-label'] === label)
  assert.ok(node, 'input ' + label)
  node.props.onInput({ target: { value } })
}
function check(ui, label, checked) {
  const node = ui.all('input').find(v => v.props['aria-label'] === label)
  assert.ok(node, 'checkbox ' + label)
  node.props.onChange({ target: { checked } })
}
const backendError = data => ({ response: { data, status: 400 } })

test('DRF default client normalizes all pages, uses role IDs and full PUT sets with the supplied Axios client', async () => {
  const { lib } = await harness()
  const request = axios.create({ headers: { Authorization: 'Bearer test-memory-token' } })
  const sent = []
  request.defaults.adapter = async config => {
    sent.push(config)
    const data = config.url === '/api/rbac/admin/roles/' && config.method === 'get'
      ? config.params?.page === '2' ? { results: [{ id: 'uuid', code: 'viewer', enabled: false }], next: null }
        : { results: [{ id: 12, code: 'operator', enabled: true, permission_count: 2 }], next: 'https://backend.test/api/rbac/admin/roles/?page=2' }
      : config.url === '/api/rbac/admin/users/' ? { results: [{ id: user.id, username: user.username, roles: [], auth_source: 'local', role_source: 'rbac_db' }], next: null }
      : config.url.includes('/users/') ? { role_codes: ['operator'] }
      : config.url.includes('/permissions/') ? { permission_codes: ['deploy'] }
      : config.url === '/api/rbac/me' ? { roles: [], permissions: [], role_source: 'rbac_db' } : {}
    return { config, data, status: 200, statusText: 'OK', headers: {} }
  }
  const api = lib.createRbacAdminApi(request)
  const roles = await api.listRoles()
  assert.deepEqual(Array.from(roles, v => [v.id, v.code, v.active]), [[12, 'operator', true], ['uuid', 'viewer', false]])
  assert.equal(roles[0].permissionCount, 2)
  assert.deepEqual(Array.from(await api.getRolePermissions('operator')), ['deploy'])
  await api.updateRolePermissions('operator', [])
  await api.createRole({ code: 'new', name: 'New', active: true })
  await api.updateRole(12, { name: 'Changed', active: false })
  await api.deleteRole('id/with slash')
  assert.equal((await api.listLocalUsers())[0].roleSource, 'rbac_db')
  assert.deepEqual(Array.from(await api.getLocalUserRoles(user.id)), ['operator'])
  await api.updateLocalUserRoles(user.id, [])
  assert.equal((await api.getMyAccess()).role_source, 'rbac_db')
  assert.equal(sent[2].url, '/api/rbac/admin/roles/12/permissions/')
  assert.deepEqual(JSON.parse(sent[3].data), { permission_codes: [] })
  assert.deepEqual(JSON.parse(sent[4].data), { code: 'new', name: 'New', enabled: true })
  assert.deepEqual(JSON.parse(sent[5].data), { name: 'Changed', enabled: false })
  assert.equal(sent[5].method, 'patch')
  assert.equal(sent[6].url, '/api/rbac/admin/roles/id%2Fwith%20slash/')
  assert.equal(sent[6].method, 'delete')
  assert.deepEqual(JSON.parse(sent[9].data), { role_codes: [] })
  assert.ok(sent.every(v => v.headers.Authorization === 'Bearer test-memory-token'))
  assert.ok(sent.every(v => !v.url.startsWith('https:')))
})

test('DRF pagination rejects cycles and malformed data instead of presenting a partial catalogue', async () => {
  const { lib } = await harness()
  const request = axios.create()
  let data = { results: [role], next: '/roles/?page=2' }
  request.defaults.adapter = async config => ({ config, data, status: 200, statusText: 'OK', headers: {} })
  const api = lib.createRbacAdminApi(request)
  await assert.rejects(api.listRoles(), /repeated/)
  for (data of [{ results: [{}], next: null }, { results: [role, role], next: null }, { results: [{ ...role, active: 'yes' }], next: null }]) await assert.rejects(api.listRoles())
  data = { results: [{ id: 1, username: 'u', roles: 'admin' }], next: null }
  await assert.rejects(api.listLocalUsers())
})

test('partial endpoints inherit default capabilities and custom write endpoints/adapters are honored', async () => {
  const { lib } = await harness()
  const request = axios.create()
  const sent = []
  request.defaults.adapter = async config => { sent.push(config); return { config, data: {}, status: 200, statusText: 'OK', headers: {} } }
  const endpoints = { roles: '/r', permissions: '/p', rolePermissions: code => '/r/' + code }
  const old = lib.createRbacAdminApi(request, { endpoints })
  assert.equal(typeof old.createRole, 'function')
  assert.equal(typeof old.updateLocalUserRoles, 'function')
  const api = lib.createRbacAdminApi(request, { endpoints: { ...endpoints, roleDetail: id => '/custom/' + id,
    updateLocalUserRoles: id => '/users/' + id }, adapters: { roleBody: data => ({ title: data.name }), userRolesBody: roles => ({ role_codes: roles }) } })
  await api.updateRole(7, { name: 'New' })
  await api.updateLocalUserRoles(3, ['operator'])
  assert.equal(sent[0].url, '/custom/7')
  assert.deepEqual(JSON.parse(sent[0].data), { title: 'New' })
  assert.deepEqual(JSON.parse(sent[1].data), { role_codes: ['operator'] })
})

test('Role CRUD buttons follow separate action permissions, opt-in and protected role rules', async () => {
  for (const [codes, editable] of [[all, true], [[permissions.roleView], true], [all, false]]) {
    const f = await fixture('RoleListView', { codes, editable })
    const labels = f.ui.all('button').map(v => f.ui.text(v))
    assert.equal(labels.includes('新增角色'), editable && codes.includes('rbac.role.create'))
    assert.equal(labels.includes('编辑'), editable && codes.includes('rbac.role.update'))
    assert.equal(labels.filter(v => v === '删除').length, editable && codes.includes('rbac.role.delete') ? 1 : 0)
    if (editable && codes.includes('rbac.role.delete')) assert.match(f.ui.text(), /系统保护角色不可删除/)
    f.ui.app.unmount()
  }
})

test('Role create submits explicit code once, closes and refreshes; new role appears in the existing matrix', async () => {
  const api = fakeApi()
  const f = await fixture('RoleListView', { api })
  await f.ui.click('新增角色')
  input(f.ui, 'Code', 'custom_role'); input(f.ui, '名称', 'Custom role'); input(f.ui, '描述', 'Test')
  await f.ui.click('保存')
  assert.deepEqual(api.calls.find(v => v[0] === 'create')[1], { code: 'custom_role', name: 'Custom role', description: 'Test', active: true })
  assert.equal(f.ui.all('dialog').length, 0)
  assert.match(f.ui.text(), /操作成功/)
  assert.match(f.ui.text(), /custom_role/)
  f.ui.app.unmount()
  const matrix = await fixture('RolePermissionMatrixView', { api })
  assert.ok(matrix.ui.all('input').some(v => v.props['aria-label'] === 'custom_role: deploy'))
  matrix.ui.app.unmount()
})

test('Role create preserves dialog and shows field validation; missing fields do not dispatch', async () => {
  const api = fakeApi()
  api.createRole = async () => { throw backendError({ code: ['Code already exists.'], non_field_errors: ['Invalid role.'] }) }
  const f = await fixture('RoleListView', { api })
  await f.ui.click('新增角色'); await f.ui.click('保存')
  assert.match(f.ui.text(), /请填写/)
  input(f.ui, 'Code', 'operator'); input(f.ui, '名称', 'Operator')
  await f.ui.click('保存')
  assert.equal(f.ui.all('dialog').length, 1)
  assert.match(f.ui.text(), /code: Code already exists/)
  assert.match(f.ui.text(), /Invalid role/)
  f.ui.app.unmount()
})

test('Role edit keeps code disabled and PATCH payload omits code', async () => {
  const f = await fixture('RoleListView')
  await f.ui.click('编辑')
  assert.equal(f.ui.all('input').find(v => v.props['aria-label'] === 'Code').props.disabled, true)
  input(f.ui, '名称', 'Updated'); check(f.ui, '启用', false)
  await f.ui.click('保存')
  const saved = f.api.calls.find(v => v[0] === 'update')
  assert.equal(saved[1], 12)
  assert.deepEqual(saved[2], { name: 'Updated', description: '', active: false })
  assert.match(f.ui.text(), /已禁用/)
  f.ui.app.unmount()
})

test('Role delete requires confirmation, displays backend detail and disappears from refreshed catalogue/matrix', async () => {
  const api = fakeApi()
  const original = api.deleteRole
  api.deleteRole = async () => { throw backendError({ detail: 'Role is assigned to users and cannot be deleted.' }) }
  const f = await fixture('RoleListView', { api })
  await f.ui.click('删除')
  assert.equal(api.calls.some(v => v[0] === 'delete'), false)
  assert.match(f.ui.text(), /确定删除角色「operator」/)
  await f.ui.click('确认删除')
  assert.match(f.ui.text(), /Role is assigned to users and cannot be deleted/)
  api.deleteRole = original
  await f.ui.click('确认删除')
  assert.doesNotMatch(f.ui.text(), /operator/)
  f.ui.app.unmount()
  const matrix = await fixture('RolePermissionMatrixView', { api })
  assert.ok(!matrix.ui.all('input').some(v => v.props['aria-label'] === 'operator: deploy'))
  matrix.ui.app.unmount()
})

test('pending Role create blocks duplicate submission and stale completion after logout', async () => {
  const api = fakeApi()
  let done, writes = 0
  api.createRole = () => { writes++; return new Promise(resolve => { done = resolve }) }
  const f = await fixture('RoleListView', { api })
  await f.ui.click('新增角色'); input(f.ui, 'Code', 'new'); input(f.ui, '名称', 'New')
  const save = f.ui.all('button').find(v => f.ui.text(v) === '保存').props.onClick
  const first = save(); await save(); await flush()
  assert.equal(writes, 1)
  assert.equal(f.ui.all('button').find(v => f.ui.text(v) === '保存').props.disabled, true)
  await f.rbac.logout(); done(); await first; await flush()
  assert.equal(f.ui.all('dialog').length, 0)
  assert.doesNotMatch(f.ui.text(), /操作成功/)
  f.ui.app.unmount()
})

test('Local users require user_role.view, independent of role.view, and update controls stay hidden for read-only users', async () => {
  for (const codes of [[], ['rbac.user_role.view'], ['rbac.user_role.view', 'rbac.user_role.update']]) {
    const f = await fixture('LocalUserRolesView', { codes })
    assert.equal(f.ui.text().includes(user.username), codes.includes('rbac.user_role.view'))
    assert.equal(f.ui.all('button').some(v => f.ui.text(v) === '管理角色'), codes.includes('rbac.user_role.update'))
    assert.equal(f.api.calls.some(v => v[0] === 'listUsers'), codes.includes('rbac.user_role.view'))
    f.ui.app.unmount()
  }
})

test('Local role choices and latest assignments come from API; PUT contains complete roles and success refreshes users', async () => {
  const f = await fixture('LocalUserRolesView')
  assert.match(f.ui.text(), /RBAC Database/)
  await f.ui.click('管理角色')
  assert.ok(f.api.calls.some(v => v[0] === 'getRoles' && v[1] === user.id))
  assert.deepEqual(f.ui.all('input').map(v => v.props['aria-label']), ['operator', 'rbac_admin'])
  check(f.ui, 'operator', false); check(f.ui, 'rbac_admin', true)
  await f.ui.click('保存')
  await f.ui.click('确认撤销')
  assert.deepEqual(f.api.calls.find(v => v[0] === 'setRoles'), ['setRoles', user.id, ['rbac_admin']])
  assert.equal(f.ui.all('dialog').length, 0)
  assert.match(f.ui.text(), /角色保存成功/)
  assert.ok(f.api.calls.filter(v => v[0] === 'listUsers').length >= 2)
  assert.doesNotMatch(f.ui.text(), /operator/)
  f.ui.app.unmount()
})

test('Local user role replacement permits empty sets and preserves unknown existing codes', async () => {
  for (const existing of [['operator'], ['operator', 'legacy']]) {
    const api = fakeApi()
    api.getLocalUserRoles = async () => existing
    const f = await fixture('LocalUserRolesView', { api })
    await f.ui.click('管理角色'); check(f.ui, 'operator', false); await f.ui.click('保存'); await f.ui.click('确认撤销')
    assert.deepEqual(api.calls.find(v => v[0] === 'setRoles')[2], existing.includes('legacy') ? ['legacy'] : [])
    f.ui.app.unmount()
  }
})

test('Local UserRole last-admin failure keeps dialog and draft with explicit backend error', async () => {
  const api = fakeApi()
  api.updateLocalUserRoles = async () => { throw backendError({ detail: 'Cannot remove the last active rbac_admin.' }) }
  const f = await fixture('LocalUserRolesView', { api })
  await f.ui.click('管理角色'); check(f.ui, 'operator', false); await f.ui.click('保存'); await f.ui.click('确认撤销')
  assert.equal(f.ui.all('dialog').length, 1)
  assert.match(f.ui.text(), /Cannot remove the last active rbac_admin/)
  assert.equal(f.ui.all('input')[0].props.checked, false)
  f.ui.app.unmount()
})

test('Local UserRole loading failure cannot save and can retry the API', async () => {
  const api = fakeApi()
  api.listRoles = async () => { throw backendError({ detail: 'No role catalogue access.' }) }
  const f = await fixture('LocalUserRolesView', { api })
  await f.ui.click('管理角色')
  assert.match(f.ui.text(), /No role catalogue access/)
  assert.ok(!f.ui.all('button').some(v => f.ui.text(v) === '保存'))
  api.listRoles = async () => [role]
  await f.ui.click('重试')
  assert.equal(f.ui.all('input')[0].props['aria-label'], 'operator')
  f.ui.app.unmount()
})

test('Local list excludes SSO identities and never offers an SSO role editor', async () => {
  const api = fakeApi()
  api.listLocalUsers = async () => [user, { ...user, id: 99, username: 'sso-user', authSource: 'sso', roleSource: 'keycloak' }]
  const f = await fixture('LocalUserRolesView', { api })
  assert.doesNotMatch(f.ui.text(), /sso-user/)
  assert.equal(f.ui.all('button').filter(v => f.ui.text(v) === '管理角色').length, 1)
  f.ui.app.unmount()
})

test('pending Local role loads are discarded on same-source login and controls revoke with access', async () => {
  const api = fakeApi()
  let done
  api.getLocalUserRoles = () => new Promise(resolve => { done = resolve })
  const f = await fixture('LocalUserRolesView', { api })
  const open = f.ui.click('管理角色')
  await flush(); f.rbac.auth.markLocalAuthenticated(); done(['operator']); await open
  assert.equal(f.ui.all('dialog').length, 0)
  assert.match(f.ui.text(), /权限不足/)
  f.ui.app.unmount()
})

test('MyAccess shows Local and SSO role_source from the existing store with no edit actions', async () => {
  for (const [source, roleSource, label] of [['local', 'rbac_db', 'RBAC Database'], ['sso', 'keycloak', 'Keycloak']]) {
    const f = await fixture('MyAccessView', { source, roleSource })
    assert.match(f.ui.text(), new RegExp('角色来源 ' + label))
    if (source === 'sso') assert.match(f.ui.text(), /SSO 用户角色由 Keycloak 管理/)
    assert.deepEqual(f.ui.all('button').map(v => f.ui.text(v)), ['刷新权限'])
    f.ui.app.unmount()
  }
})

test('route metadata titles and menu permissions match all four views without positional title mapping', async () => {
  const { lib } = await harness()
  const options = { permissions: { ...permissions, userRoleView: 'host.users.read' }, basePath: '/settings', permissionMetaKey: 'capability' }
  const routes = lib.createRbacAdminRoutes(options)
  assert.deepEqual(Array.from(lib.createRbacAdminMenu(options), v => [v.path, v.title, v.permission]), [
    ['/settings/roles', '角色列表', permissions.roleView], ['/settings/role-permissions', '角色权限矩阵', permissions.rolePermissionView],
    ['/settings/local-user-roles', '本地用户角色', 'host.users.read'], ['/settings/me', '当前用户权限', undefined],
  ])
  assert.equal(routes[2].meta.capability, 'host.users.read')
  const visible = lib.filterMenus(lib.createRbacAdminMenu(options), code => code === 'host.users.read')
  assert.equal(visible.length, 1); assert.equal(visible[0].title, '本地用户角色')
})

test('direct Admin route reload restores Local/Hybrid/SSO using existing lifecycle and guard without login redirects', async () => {
  for (const mode of ['local', 'hybrid', 'sso']) {
    const h = await harness()
    const pinia = createPinia()
    let logins = 0
    const provider = { async init() {}, async initPassive() {}, isAuthenticated: () => true,
      async login() { logins++ }, async logout() {}, getAccessToken: () => 'token', async refreshToken() { return false } }
    const rbac = h.lib.createRbacPlugin({ pinia, mode, ...(mode !== 'local' ? { auth: provider } : {}),
      loadAccess: async () => ({ auth_source: mode === 'sso' ? 'sso' : 'local', roles: [], permissions: ['rbac.user_role.view'] }) })
    await rbac.restoreSession()
    const router = createRouter({ history: createMemoryHistory(), routes: [
      ...h.lib.createRbacAdminRoutes({ permissions }).map(v => ({ ...v, component: { render: () => null } })),
      { path: '/403', component: { render: () => null } },
    ] })
    h.lib.installRbacGuard(router, { accessStore: rbac.accessStore })
    await router.push('/rbac-admin/local-user-roles')
    assert.equal(router.currentRoute.value.path, '/rbac-admin/local-user-roles')
    assert.equal(logins, 0)
  }
})


test('KeepAlive matrix reactivation reloads roles created while the matrix was hidden', async () => {
  const h = await harness()
  const pinia = createPinia()
  const api = fakeApi()
  const rbac = h.lib.createRbacPlugin({ pinia, mode: 'local', loadAccess: async () => ({ roles: [], permissions: all }) })
  rbac.auth.markLocalAuthenticated(); await rbac.accessStore.loadAccess()
  const Matrix = (await h.load('src/lib/admin/views/RolePermissionMatrixView.ts')).default
  const Other = defineComponent({ render: () => vnode('p', 'Other page') })
  const selected = ref(true)
  const Wrapper = defineComponent({ setup: () => () => vnode(KeepAlive, null, { default: () => vnode(selected.value ? Matrix : Other) }) })
  const ui = mountView(Wrapper, [pinia, rbac, h.lib.createRbacAdminPlugin({ api, permissions, editable: true })])
  await flush(); selected.value = false; await flush()
  await api.createRole({ code: 'added_elsewhere', name: 'New' })
  selected.value = true; await flush()
  assert.ok(ui.all('input').some(v => v.props['aria-label'] === 'added_elsewhere: deploy'))
  ui.app.unmount()
})

test('configured action permission codes replace defaults for Role CRUD', async () => {
  const f = await fixture('RoleListView', { codes: [permissions.roleView, 'custom.create'],
    permissionOptions: { ...permissions, roleCreate: 'custom.create' } })
  assert.ok(f.ui.all('button').some(v => f.ui.text(v) === '新增角色'))
  assert.ok(!f.ui.all('button').some(v => f.ui.text(v) === '编辑'))
  f.ui.app.unmount()
})

test('Local role PUT blocks duplicate saves and late completion cannot refresh a replacement session', async () => {
  const api = fakeApi()
  let done, writes = 0
  api.updateLocalUserRoles = () => { writes++; return new Promise(resolve => { done = resolve }) }
  const f = await fixture('LocalUserRolesView', { api })
  await f.ui.click('管理角色')
  const save = f.ui.all('button').find(v => f.ui.text(v) === '保存').props.onClick
  const first = save(); await save(); await flush()
  assert.equal(writes, 1)
  f.rbac.auth.markLocalAuthenticated()
  const count = api.calls.filter(v => v[0] === 'listUsers').length
  done(); await first; await flush()
  assert.equal(api.calls.filter(v => v[0] === 'listUsers').length, count)
  assert.equal(f.ui.all('dialog').length, 0)
  assert.doesNotMatch(f.ui.text(), /角色保存成功/)
  f.ui.app.unmount()
})

test('successful Role write followed by failed catalogue reload reports submitted state without false success', async () => {
  const api = fakeApi()
  api.createRole = async () => { api.listRoles = async () => { throw Error('offline') } }
  const f = await fixture('RoleListView', { api })
  await f.ui.click('新增角色'); input(f.ui, 'Code', 'new'); input(f.ui, '名称', 'New'); await f.ui.click('保存')
  assert.match(f.ui.text(), /操作已提交/)
  assert.doesNotMatch(f.ui.text(), /操作成功/)
  assert.equal(f.ui.all('dialog').length, 0)
  f.ui.app.unmount()
})


test('0.3.3 defaults survive a single me override, undefined overrides and existing host subsets', async () => {
  const { lib } = await harness()
  for (const endpoints of [undefined, { me: '/custom/me' }, { roleDetail: undefined, localUsers: undefined },
    { roles: '/r', permissions: '/p', rolePermissions: () => '/rp', updateRolePermissions: () => '/rp', me: '/custom/me' }]) {
    const sent = []
    const http = axios.create({ adapter: async config => {
      sent.push(config)
      const data = config.url === (endpoints?.roles ?? '/api/rbac/admin/roles/') ? [{ id: 12, code: 'operator' }]
        : config.url.endsWith('/users/') ? [{ id: 7, username: 'u', is_active: true, auth_source: 'local', role_source: 'rbac_db', roles: ['operator'] }]
        : config.url.endsWith('/roles/') ? { roles: ['operator'] }
        : config.url.endsWith('/permissions/') || config.url === '/rp' ? { permissions: ['deploy'] }
        : { roles: [], permissions: [] }
      return { config, data, status: 200, statusText: 'OK', headers: {} }
    } })
    const api = lib.createRbacAdminApi(http, { endpoints })
    for (const method of ['createRole', 'updateRole', 'deleteRole', 'listLocalUsers', 'getLocalUserRoles', 'updateLocalUserRoles']) assert.equal(typeof api[method], 'function')
    await api.listRoles()
    assert.deepEqual(Array.from(await api.getRolePermissions('operator')), ['deploy'])
    await api.updateRolePermissions('operator', ['deploy'])
    assert.deepEqual(JSON.parse(sent.at(-1).data), { permission_codes: ['deploy'] })
    await api.updateRole(12, { name: 'Updated' })
    assert.equal(sent.at(-1).url, '/api/rbac/admin/roles/12/')
    assert.deepEqual(JSON.parse(JSON.stringify((await api.listLocalUsers())[0])), {
      id: 7, username: 'u', active: true, authSource: 'local', roleSource: 'rbac_db', roles: ['operator'],
    })
    assert.deepEqual(Array.from(await api.getLocalUserRoles(7)), ['operator'])
    await api.updateLocalUserRoles(7, ['operator'])
    assert.equal(sent.at(-1).url, '/api/rbac/admin/users/7/roles/')
    assert.deepEqual(JSON.parse(sent.at(-1).data), { role_codes: ['operator'] })
    await api.getMyAccess()
    assert.equal(sent.at(-1).url, endpoints?.me ?? '/api/rbac/me')
  }
})

test('detail GETs, PUT role update and explicit endpoint disabling are independent capabilities', async () => {
  const { lib } = await harness()
  const sent = []
  const http = axios.create({ adapter: async config => {
    sent.push(config)
    return { config, data: { id: 12, code: 'operator', enabled: true }, status: 200, statusText: 'OK', headers: {} }
  } })
  const api = lib.createRbacAdminApi(http, { basePath: '/custom/', roleUpdateMethod: 'put' })
  assert.equal((await api.getRole(12)).active, true)
  assert.equal(sent.at(-1).url, '/custom/roles/12/')
  assert.equal((await api.getPermission('a/b')).code, 'operator')
  assert.equal(sent.at(-1).url, '/custom/permissions/a%2Fb/')
  await api.updateRole(12, { name: 'New' })
  assert.equal(sent.at(-1).method, 'put')
  const disabled = lib.createRbacAdminApi(http, { endpoints: { roleDetail: null, localUsers: null,
    localUserRoles: null, updateLocalUserRoles: null, updateRolePermissions: null } })
  for (const method of ['updateRole', 'deleteRole', 'listLocalUsers', 'getLocalUserRoles', 'updateLocalUserRoles', 'updateRolePermissions']) assert.equal(disabled[method], undefined)
  assert.equal(typeof disabled.createRole, 'function')
  assert.equal(disabled.supportsUpdates, false)
  assert.equal(api.createPermission, undefined)
  assert.equal(api.updatePermission, undefined)
  assert.equal(api.deletePermission, undefined)
})

test('Role action permissions are independent and missing API methods hide only their own action', async () => {
  for (const [permission, method, label] of [['rbac.role.create', 'createRole', '新增角色'], ['rbac.role.update', 'updateRole', '编辑'], ['rbac.role.delete', 'deleteRole', '删除']]) {
    for (const enabled of [true, false]) {
      const api = fakeApi(); api.supportsUpdates = false
      if (!enabled) delete api[method]
      const f = await fixture('RoleListView', { api, codes: [permissions.roleView, permission] })
      const actions = f.ui.all('button').map(node => f.ui.text(node)).filter(text => ['新增角色', '编辑', '删除'].includes(text))
      assert.equal(actions.includes(label), enabled)
      assert.ok(actions.every(text => text === label))
      if (label === '删除') assert.equal(actions.length, enabled ? 1 : 0)
      f.ui.app.unmount()
    }
  }
})

test('Local users stay readable without update capability, and missing role catalogue permission prevents its request', async () => {
  const api = fakeApi(); delete api.updateLocalUserRoles
  const f = await fixture('LocalUserRolesView', { api })
  assert.match(f.ui.text(), /admin@example.test/)
  assert.doesNotMatch(f.ui.text(), /请配置本地用户 Admin API/)
  assert.ok(!f.ui.all('button').some(node => f.ui.text(node) === '管理角色'))
  f.ui.app.unmount()
  const g = await fixture('LocalUserRolesView', { codes: ['rbac.user_role.view', 'rbac.user_role.update'] })
  await g.ui.click('管理角色')
  assert.match(g.ui.text(), /缺少角色目录查看权限/)
  assert.equal(g.api.calls.some(call => call[0] === 'listRoles'), false)
  g.ui.app.unmount()
})


test('default Local API mounts a standard backend user without host adapters or configuration errors', async () => {
  const { lib } = await harness()
  const http = axios.create({ adapter: async config => ({ config, status: 200, statusText: 'OK', headers: {},
    data: { results: [{ id: 8, username: 'standard-local', is_active: true, auth_source: 'local', role_source: 'rbac_db', roles: ['viewer'] }], next: null },
  }) })
  const f = await fixture('LocalUserRolesView', { api: lib.createRbacAdminApi(http), codes: ['rbac.user_role.view'] })
  assert.match(f.ui.text(), /standard-local/)
  assert.match(f.ui.text(), /viewer/)
  assert.doesNotMatch(f.ui.text(), /请配置本地用户 Admin API|加载失败/)
  assert.ok(!f.ui.all('button').some(node => f.ui.text(node) === '管理角色'))
  f.ui.app.unmount()
})

test('default Role update never sends code even from an untyped JavaScript caller', async () => {
  const { lib } = await harness()
  let sent
  const http = axios.create({ adapter: async config => {
    sent = config
    return { config, status: 200, statusText: 'OK', headers: {}, data: {} }
  } })
  await lib.createRbacAdminApi(http).updateRole(12, { code: 'renamed', name: 'New' })
  assert.deepEqual(JSON.parse(sent.data), { name: 'New' })
})
