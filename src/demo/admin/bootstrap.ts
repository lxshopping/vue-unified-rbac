import { createApp, defineComponent, h, ref } from 'vue'
import { createRbacPlugin, createRbacAdminPlugin, RoleListView, RolePermissionMatrixView, MyAccessView } from '@scotec/vue-unified-rbac'
import type { RbacAdminApi } from '@scotec/vue-unified-rbac'

/** Isolated in-memory showcase: no backend or authentication service required. */
export async function bootstrapAdminDemo() {
  const permissions = { roleView: 'rbac.role.view', roleManage: 'rbac.role.manage', meView: 'rbac.me.view' }
  const codes = ['release.order.view', 'release.order.create', 'release.order.approve', ...Object.values(permissions)]
  const grants: Record<string, string[]> = { release_admin: [...codes], release_viewer: ['release.order.view'] }
  const api: RbacAdminApi = {
    supportsUpdates: true,
    async listRoles() { return [
      { code: 'release_admin', name: 'Release Admin', active: true, permissionCount: grants.release_admin.length, description: '发布管理员' },
      { code: 'release_viewer', name: 'Release Viewer', active: true, permissionCount: grants.release_viewer.length, description: '只读查看' },
      { code: 'archived', name: 'Archived', active: false, permissionCount: 0, description: '已停用角色' },
    ] },
    async listPermissions() { return codes.map(code => ({ code })) },
    async getRolePermissions(role) { return [...(grants[role] ?? [])] },
    async updateRolePermissions(role, next) { grants[role] = [...next] },
    async getMyAccess() { return { username: 'demo.user', auth_source: 'local', roles: ['release_admin'], permissions: [...codes] } },
  }
  const rbac = createRbacPlugin({ mode: 'local', loadAccess: () => api.getMyAccess() })
  rbac.auth.markLocalAuthenticated()
  await rbac.accessStore.loadAccess()
  const editable = new URLSearchParams(window.location.search).has('editable')
  const App = defineComponent({ setup() {
    const selected = ref(0)
    const views = [RoleListView, RolePermissionMatrixView, MyAccessView]
    return () => h('main', { style: { padding: 'clamp(12px, 3vw, 40px)' } }, [
      h('h1', 'RBAC 管理'),
      h('p', '内存演示数据 · ' + (editable ? '可编辑模式' : '只读模式')),
      h('nav', { class: 'rbac-admin-toolbar', style: { marginBottom: '24px' }, 'aria-label': 'Admin 页面' },
        ['角色列表', '角色权限矩阵', '当前用户权限'].map((title, index) => h('button', {
          class: 'rbac-admin-button rbac-admin-button--' + (index === selected.value ? 'primary' : 'secondary'),
          type: 'button', 'aria-pressed': selected.value === index, onClick: () => { selected.value = index },
        }, title))),
      h(views[selected.value]),
    ])
  } })
  createApp(App).use(rbac).use(createRbacAdminPlugin({ api, permissions, editable })).mount('#app')
}
