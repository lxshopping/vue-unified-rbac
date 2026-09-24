import { createApp, defineComponent, h, ref } from 'vue'
import { createRbacPlugin, createRbacAdminPlugin, RoleListView, RolePermissionMatrixView, LocalUserRolesView, MyAccessView } from '@scotec/vue-unified-rbac'
import type { RbacAdminApi, RbacRole } from '@scotec/vue-unified-rbac'

/** Isolated in-memory showcase: no backend or authentication service required. */
export async function bootstrapAdminDemo() {
  const permissions = { roleView: 'rbac.role.view', roleUpdate: 'rbac.role.update', roleCreate: 'rbac.role.create',
    roleDelete: 'rbac.role.delete', userRoleView: 'rbac.user_role.view', userRoleUpdate: 'rbac.user_role.update', meView: 'rbac.me.view' }
  const codes = ['release.order.view', 'release.order.create', 'release.order.approve', ...Object.values(permissions)]
  const grants: Record<string, string[]> = { release_admin: [...codes], release_viewer: ['release.order.view'] }
  let roles: RbacRole[] = [
    { id: 1, code: 'rbac_admin', name: 'RBAC Admin', active: true, protected: true, description: '系统保护角色' },
    { id: 2, code: 'release_admin', name: 'Release Admin', active: true, description: '发布管理员' },
    { id: 3, code: 'release_viewer', name: 'Release Viewer', active: true, description: '只读查看' },
  ]
  let nextId = 4
  let assigned = ['rbac_admin', 'release_admin']
  const api: RbacAdminApi = {
    supportsUpdates: true,
    async listRoles() { return roles.map(role => ({ ...role, permissionCount: (grants[role.code] ?? []).length })) },
    async createRole(data) {
      if (roles.some(role => role.code === data.code)) throw { response: { data: { code: ['Code already exists.'] } } }
      roles.push({ ...data, id: nextId++ })
    },
    async updateRole(id, data) { roles = roles.map(role => role.id === id ? { ...role, ...data } : role) },
    async deleteRole(id) {
      const role = roles.find(role => role.id === id)
      if (role && assigned.includes(role.code)) throw { response: { data: { detail: 'Role is assigned to users and cannot be deleted.' } } }
      roles = roles.filter(role => role.id !== id)
    },
    async listPermissions() { return codes.map(code => ({ code })) },
    async getRolePermissions(role) { return [...(grants[role] ?? [])] },
    async updateRolePermissions(role, next) { grants[role] = [...next] },
    async listLocalUsers() { return [{ id: 1, username: 'demo.user', active: true, roles: [...assigned], authSource: 'local', roleSource: 'rbac_db' }] },
    async getLocalUserRoles() { return [...assigned] },
    async updateLocalUserRoles(_id, next) {
      if (!next.includes('rbac_admin')) throw { response: { data: { detail: 'Cannot remove the last active rbac_admin.' } } }
      assigned = [...next]
    },
    async getMyAccess() { return { username: 'demo.user', auth_source: 'local', role_source: 'rbac_db', roles: [...assigned], permissions: [...codes] } },
  }
  const rbac = createRbacPlugin({ mode: 'local', loadAccess: () => api.getMyAccess() })
  rbac.auth.markLocalAuthenticated()
  await rbac.accessStore.loadAccess()
  const editable = new URLSearchParams(window.location.search).has('editable')
  const App = defineComponent({ setup() {
    const selected = ref(0)
    const views = [RoleListView, RolePermissionMatrixView, LocalUserRolesView, MyAccessView]
    return () => h('main', { style: { padding: 'clamp(12px, 3vw, 40px)' } }, [
      h('h1', 'RBAC 管理'),
      h('p', '内存演示数据 · ' + (editable ? '可编辑模式' : '只读模式')),
      h('nav', { class: 'rbac-admin-toolbar', style: { marginBottom: '24px' }, 'aria-label': 'Admin 页面' },
        ['角色列表', '角色权限矩阵', '本地用户角色', '当前用户权限'].map((title, index) => h('button', {
          class: 'rbac-admin-button rbac-admin-button--' + (index === selected.value ? 'primary' : 'secondary'),
          type: 'button', 'aria-pressed': selected.value === index, onClick: () => { selected.value = index },
        }, title))),
      h(views[selected.value]),
    ])
  } })
  createApp(App).use(rbac).use(createRbacAdminPlugin({ api, permissions, editable })).mount('#app')
}
