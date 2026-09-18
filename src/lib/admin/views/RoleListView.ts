import { defineComponent, h } from 'vue'
import { useRbacAdmin } from '../context'
import { frame, useAdminResource } from './shared'

export default defineComponent({
  name: 'RoleListView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(() => api.listRoles())
    return () => frame('角色列表', state.allowed.value, state.loading.value, state.error.value, state.reload,
      state.data.value && (state.data.value.length ? h('div', { style: { overflowX: 'auto' } }, [h('table', { class: 'rbac-admin-table' }, [
        h('thead', [h('tr', ['Code', '名称', '启用', '权限数', '描述'].map(label => h('th', { scope: 'col' }, label)))]),
        h('tbody', state.data.value.map(role => h('tr', { key: role.code }, [
          h('th', { scope: 'row' }, role.code), h('td', role.name ?? '—'),
          h('td', role.active === undefined ? '—' : role.active ? '是' : '否'),
          h('td', String(role.permissionCount ?? '—')), h('td', role.description ?? '—'),
        ]))),
      ])]) : h('p', '暂无角色')))
  },
})
