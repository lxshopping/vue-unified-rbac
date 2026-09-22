import { defineComponent, h } from 'vue'
import { useRbacAdmin } from '../context'
import { frame, status, useAdminResource } from './shared'

export default defineComponent({
  name: 'RoleListView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(() => api.listRoles())
    return () => frame('角色列表', state.allowed.value, state.loading.value, state.error.value, state.reload,
      state.data.value && (state.data.value.length ? h('div', { class: 'rbac-admin-table-wrapper', tabindex: 0, role: 'region', 'aria-label': '角色列表' }, [h('table', { class: 'rbac-admin-table' }, [
        h('thead', [h('tr', ['Code', '名称', '启用', '权限数', '描述'].map(label => h('th', { scope: 'col' }, label)))]),
        h('tbody', state.data.value.map(role => h('tr', { key: role.code }, [
          h('th', { scope: 'row', class: 'rbac-admin-code' }, role.code), h('td', role.name ?? '—'),
          h('td', [h('span', { class: 'rbac-admin-badge' + (role.active ? ' rbac-admin-badge--success' : '') }, role.active === undefined ? '—' : role.active ? '已启用' : '已禁用')]),
          h('td', [h('span', { class: 'rbac-admin-badge' }, String(role.permissionCount ?? '—'))]), h('td', role.description ?? '—'),
        ]))),
      ])]) : status('暂无角色', 'empty')), false, '查看系统中已经配置的 RBAC 角色及其状态。')
  },
})
