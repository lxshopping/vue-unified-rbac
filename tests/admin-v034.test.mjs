import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import axios from 'axios'
import { harness } from './helpers/harness.mjs'
import { mountView, flush } from './helpers/renderer.mjs'

const codes = ['rbac.role.view', 'rbac.role.create', 'rbac.role.update', 'rbac.role.delete', 'rbac.role_permission.view', 'rbac.role_permission.update', 'rbac.user_role.view', 'rbac.user_role.update', 'rbac.permission.view', 'rbac.audit.view']
const row = { id: 7, actor_type: 'local', actor_id: '1', actor_name: 'admin', action: 'role.permissions.replace', target_type: 'RolePermission', target_id: '3', target_name: 'Viewer', before_data: { nested: { list: [true, null, 1] }, password: 'DO-NOT-SHOW' }, after_data: { arbitrary: '<script>example</script>', token: 'DO-NOT-SHOW' }, created_at: '2026-10-08T08:00:00Z', request_id: 'req-123', result: 'success', reason_code: '' }
const page = { count: 2, next: 'https://untrusted.test/audit/?page=2', previous: null, results: [row] }
async function fixture({ grants = codes, roles = ['rbac_admin'], view = 'AuditLogView', overrides = {} } = {}) {
  const ctx = await harness(), pinia = createPinia(), calls = []
  const rbac = ctx.lib.createRbacPlugin({ pinia, mode: 'local', loadAccess: async () => ({ username: 'admin', auth_source: 'local', role_source: 'rbac_db', roles, permissions: grants }) })
  rbac.auth.markLocalAuthenticated(); await rbac.accessStore.loadAccess()
  const api = {
    async listAuditLogs(query) { calls.push(['list', { ...query }]); return query.page === 2 ? { ...page, next: null, previous: '?page=1' } : page },
    async getAuditLog(id) { calls.push(['detail', id]); return row },
    async listRoles() { return [{ id: 3, code: 'rbac_admin', name: 'Admin' }] },
    async listPermissions() { return [{ code: 'rbac.user_role.update' }] },
    async getRolePermissions() { return ['rbac.user_role.update'] },
    async updateRolePermissions(...args) { calls.push(['write', ...args]) },
    async listLocalUsers() { return [{ id: 1, username: 'admin', roles: ['rbac_admin'], authSource: 'local', roleSource: 'rbac_db' }] },
    async getLocalUserRoles() { return ['rbac_admin'] },
    async updateLocalUserRoles(...args) { calls.push(['write', ...args]) },
    ...overrides,
  }
  const component = (await ctx.load('src/lib/admin/views/' + view + '.ts')).default
  const ui = mountView(component, [pinia, rbac, ctx.lib.createRbacAdminPlugin({ api, permissions: {}, editable: true })]); await flush()
  return { ...ctx, rbac, api, calls, ui }
}
function change(f, label, value, event = 'onInput') {
  const item = [...f.ui.all('input'), ...f.ui.all('select')].find(item => item.props['aria-label'] === label)
  assert.ok(item, label); item.props[event]({ target: { value, checked: value } })
}

test('audit client reuses basePath, one-page filters, encoded detail, adapters and optional capabilities', async () => {
  const { lib } = await harness(), http = axios.create(), calls = []
  http.defaults.adapter = async config => { calls.push(config); return { config, status: 200, headers: {}, data: config.url.endsWith('audit-logs/') ? page : row } }
  const api = lib.createRbacAdminApi(http, { basePath: '/custom/admin/' })
  const query = { page: 1, page_size: 200, actor_type: 'local', actor_id: '1', actor_name: 'admin', action: 'role.update', target_type: 'Role', target_id: '3', result: 'denied', request_id: 'request', created_after: '2026-10-08T00:00:00Z', created_before: '2026-10-09T00:00:00Z' }
  const result = await api.listAuditLogs(query)
  assert.equal(result.count, 2); assert.equal(result.next, page.next); assert.equal(calls.length, 1)
  assert.deepEqual({ ...calls[0].params }, query); assert.equal(calls[0].url, '/custom/admin/audit-logs/')
  assert.equal((await api.getAuditLog('a/b')).actor_id, '1'); assert.equal(calls[1].url, '/custom/admin/audit-logs/a%2Fb/')
  assert.ok(calls.every(call => call.method === 'get'))
  for (const bad of [{ page: 0 }, { page_size: 201 }, { page: 1.2 }]) await assert.rejects(api.listAuditLogs(bad))
  const disabled = lib.createRbacAdminApi(http, { endpoints: { auditLogs: null, auditLogDetail: null } })
  assert.equal(disabled.listAuditLogs, undefined); assert.equal(disabled.getAuditLog, undefined)
  const adapted = lib.createRbacAdminApi(http, { endpoints: { auditLogs: '/custom' }, adapters: { auditLogs: () => page, auditLog: () => row } })
  assert.equal((await adapted.listAuditLogs()).results[0].id, 7)
  http.defaults.adapter = async config => ({ config, status: 200, headers: {}, data: { ...page, results: [{ ...row, actor_id: 1 }] } })
  await assert.rejects(api.listAuditLogs(), /Invalid audit/)
})

test('audit view sends filters, consumes pagination, renders safe generic JSON and has no write actions', async () => {
  const f = await fixture()
  assert.match(f.ui.text(), /Viewer/)
  change(f, '操作人（精确匹配）', 'alice'); change(f, '操作类型', 'role.update'); change(f, '对象类型', 'Role'); change(f, '对象 ID', '3')
  change(f, '结果', 'denied', 'onChange'); change(f, '开始时间（本地时间）', '2026-10-08T08:00'); change(f, '结束时间（本地时间）', '2026-10-09T08:00')
  await f.ui.click('查询')
  const query = f.calls.at(-1)[1]; assert.equal(query.actor_name, 'alice'); assert.equal(query.result, 'denied'); assert.match(query.created_after, /Z$/)
  await f.ui.click('下一页'); assert.equal(f.calls.at(-1)[1].page, 2); assert.equal(f.calls.at(-1)[1].actor_name, 'alice')
  await f.ui.click('上一页'); assert.equal(f.calls.at(-1)[1].page, 1)
  await f.ui.click('详情 #7'); assert.match(f.ui.text(), /req-123/); assert.match(f.ui.text(), /nested/); assert.match(f.ui.text(), /arbitrary/)
  assert.match(f.ui.text(), /REDACTED/); assert.doesNotMatch(f.ui.text(), /DO-NOT-SHOW/); assert.equal(f.ui.all('script').length, 0)
  assert.ok(f.ui.all('pre').every(node => node.props.innerHTML === undefined))
  assert.ok(!f.ui.all('button').some(node => /新增|编辑|删除/.test(node.text)))
  f.ui.app.unmount()
})

test('audit denies direct mounting and clears late details when session changes', async () => {
  const denied = await fixture({ grants: [] }); assert.equal(denied.calls.length, 0); assert.match(denied.ui.text(), /权限不足/); denied.ui.app.unmount()
  let resolve
  const f = await fixture({ overrides: { getAuditLog: () => new Promise(done => { resolve = done }) } })
  const pending = f.ui.click('详情 #7'); await flush(); f.rbac.auth.clearAuthSource(); resolve(row); await pending
  assert.equal(f.ui.all('dialog').length, 0); assert.doesNotMatch(f.ui.text(), /Viewer/); f.ui.app.unmount()
})

test('three role fixtures load me, filter menus and reject direct restricted routes including refresh', async () => {
  for (const [role, grants] of [['rbac_admin', codes], ['release_admin', ['release.order.view', 'rbac.audit.view']], ['release_viewer', ['release.order.view']]]) {
    const f = await fixture({ grants, roles: [role] })
    assert.deepEqual(Array.from(f.rbac.accessStore.roles), [role])
    const options = { permissions: {}, includeAudit: true }
    const menus = f.lib.filterMenus(f.lib.createRbacAdminMenu(options), f.rbac.accessStore.hasPermission, true)
    assert.equal(menus.some(menu => menu.path.endsWith('/audit-logs')), grants.includes('rbac.audit.view'))
    assert.equal(menus.some(menu => menu.path.endsWith('/roles')), grants.includes('rbac.role.view'))
    const routes = f.lib.createRbacAdminRoutes(options).map(route => ({ ...route, component: { render: () => null } }))
    const router = createRouter({ history: createMemoryHistory(), routes: [...routes, { path: '/403', component: { render: () => null } }] })
    f.lib.installRbacGuard(router, { accessStore: f.rbac.accessStore })
    f.rbac.accessStore.clearAccess()
    await router.push('/rbac-admin/audit-logs'); assert.equal(router.currentRoute.value.path, grants.includes('rbac.audit.view') ? '/rbac-admin/audit-logs' : '/403')
    assert.equal(f.rbac.accessStore.loaded, true)
    await router.push('/rbac-admin/role-permissions'); assert.equal(router.currentRoute.value.path, grants.includes('rbac.role_permission.view') ? '/rbac-admin/role-permissions' : '/403')
    assert.equal(f.lib.createRbacAdminRoutes({ permissions: {} }).length, 4)
    f.ui.app.unmount()
  }
})

for (const code of ['rbac_last_admin', 'rbac_last_critical_permission']) {
  test(code + ': matrix confirmation, backend detail and server-state recovery', async () => {
    let writes = 0
    const f = await fixture({ view: 'RolePermissionMatrixView', overrides: { async updateRolePermissions() { writes++; throw { response: { status: 400, data: { code, detail: 'Backend rejected this change.', permissions: ['rbac.user_role.update', null, { unsafe: true }] } } } } } })
    change(f, 'rbac_admin: rbac.user_role.update', false, 'onChange'); await f.ui.click('保存 rbac_admin')
    assert.equal(writes, 0); assert.match(f.ui.text(), /关键管理权限/); assert.match(f.ui.text(), /自己的权限/)
    await f.ui.click('取消'); assert.equal(writes, 0)
    await f.ui.click('保存 rbac_admin'); await f.ui.click('确认撤销')
    assert.equal(writes, 1); assert.match(f.ui.text(), /Backend rejected this change/); assert.match(f.ui.text(), /rbac.user_role.update/)
    assert.doesNotMatch(f.ui.text(), /保存成功|unsafe/); assert.equal(f.ui.all('input')[0].props.checked, true)
    f.ui.app.unmount()
  })
  test(code + ': local role rejection preserves persisted list and unsaved draft', async () => {
    let writes = 0
    const f = await fixture({ view: 'LocalUserRolesView', overrides: { async updateLocalUserRoles() { writes++; throw { response: { status: 400, data: { code, detail: 'User role change denied.', permissions: ['rbac.user_role.update'] } } } } } })
    await f.ui.click('管理角色'); change(f, 'rbac_admin', false, 'onChange'); await f.ui.click('保存'); assert.equal(writes, 0)
    await f.ui.click('确认撤销'); assert.equal(writes, 1); assert.match(f.ui.text(), /User role change denied/)
    assert.doesNotMatch(f.ui.text(), /保存成功/); assert.equal(f.ui.all('input')[0].props.checked, false)
    await f.ui.click('取消'); assert.match(f.ui.text(), /rbac_admin/); f.ui.app.unmount()
  })
}

test('error normalization keeps legacy field errors and handles HTTP statuses without detail parsing', async () => {
  const f = await harness(), { errorMessage } = await f.load('src/lib/admin/views/shared.ts')
  for (const status of [400, 401, 403, 404, 405, 500]) assert.notEqual(errorMessage({ response: { status } }), '操作失败，请重试。')
  assert.match(errorMessage({ response: { status: 400, data: { name: ['Required'] } } }), /name: Required/)
  assert.equal(errorMessage({ response: { data: { detail: 'rbac_last_admin is text' } } }), 'rbac_last_admin is text')
  const denied = await fixture({ overrides: { async listAuditLogs() { throw { response: { status: 403, data: { detail: 'Audit forbidden' } } } } } })
  assert.match(denied.ui.text(), /Audit forbidden/); assert.doesNotMatch(denied.ui.text(), /Viewer/); denied.ui.app.unmount()
})

test('audit ignores late list data, validates time ranges and handles missing optional clients', async () => {
  let finish
  const f = await fixture({ overrides: { listAuditLogs: () => new Promise(resolve => { finish = resolve }) } })
  f.rbac.auth.clearAuthSource(); finish(page); await flush(); assert.doesNotMatch(f.ui.text(), /Viewer/); f.ui.app.unmount()
  const dates = await fixture()
  change(dates, '开始时间（本地时间）', '2026-10-09T08:00'); change(dates, '结束时间（本地时间）', '2026-10-08T08:00')
  await dates.ui.click('查询'); assert.match(dates.ui.text(), /开始时间不能晚于结束时间/); assert.equal(dates.calls.length, 1); dates.ui.app.unmount()
  const missing = await fixture({ overrides: { listAuditLogs: undefined, getAuditLog: undefined } })
  assert.match(missing.ui.text(), /加载失败/); assert.equal(missing.ui.all('table').length, 0); missing.ui.app.unmount()
})

test('audit route/menu custom mapping and key are shared; old APIs need no audit methods', async () => {
  const { lib } = await harness()
  const options = { permissions: { auditView: 'host.audit.read' }, includeAudit: true, basePath: '/admin', namePrefix: 'host', permissionMetaKey: 'grant' }
  const route = lib.createRbacAdminRoutes(options).find(route => route.path === '/admin/audit-logs')
  assert.equal(route.name, 'host-audit-logs'); assert.equal(route.meta.grant, 'host.audit.read')
  assert.equal(lib.createRbacAdminMenu(options).find(menu => menu.path === route.path).permission, 'host.audit.read')
  assert.equal(lib.createRbacAdminMenu({ permissions: {} }).length, 4)
})

test('audit client rejects malformed pages and never follows an untrusted pagination host', async () => {
  const { lib } = await harness(), http = axios.create()
  for (const data of [{ ...page, count: -1 }, { ...page, next: 2 }, { ...page, results: {} }, { ...page, results: [{ ...row, before_data: [] }] }]) {
    let calls = 0
    http.defaults.adapter = async config => { calls++; return { config, status: 200, headers: {}, data } }
    await assert.rejects(lib.createRbacAdminApi(http).listAuditLogs()); assert.equal(calls, 1)
  }
})

test('Role delete retains backend last-admin detail and never removes a rejected row', async () => {
  let writes = 0
  const f = await fixture({ view: 'RoleListView', overrides: {
    async listRoles() { return [{ id: 4, code: 'recovery', name: 'Recovery' }] },
    async deleteRole() { writes++; throw { response: { status: 400, data: { code: 'rbac_last_admin', detail: 'Cannot remove recovery.', permissions: ['rbac.user_role.update'] } } } },
  } })
  await f.ui.click('删除'); assert.equal(writes, 0); await f.ui.click('确认删除'); assert.equal(writes, 1)
  assert.match(f.ui.text(), /Cannot remove recovery/); assert.match(f.ui.text(), /Recovery/); assert.doesNotMatch(f.ui.text(), /操作成功/); f.ui.app.unmount()
})
