import { computed, defineComponent, h, ref } from 'vue'
import { useRbacAdmin } from '../context'
import type { RbacRole } from '../api/types'
import { AdminDialog, button, frame, message, status, useAdminEditor, useAdminResource } from './shared'

export default defineComponent({
  name: 'RoleListView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(() => api.listRoles())
    const selected = ref<RbacRole | null>(null)
    const mode = ref<'create' | 'edit' | 'delete'>('create')
    const code = ref(''), name = ref(''), description = ref('')
    const active = ref(true)
    const can = (action: 'roleCreate' | 'roleUpdate' | 'roleDelete') => state.allowed.value &&
      state.admin.editable === true && state.rbac.accessStore.hasPermission(state.admin.permissions[action])
    const canCreate = computed(() => can('roleCreate') && !!api.createRole)
    const canEdit = (role: RbacRole) => can('roleUpdate') && !!api.updateRole && role.id !== undefined
    const protectedRole = (role: RbacRole) => role.protected === true || role.code === 'rbac_admin'
    const canDelete = (role: RbacRole) => can('roleDelete') && !!api.deleteRole && role.id !== undefined && !protectedRole(role)
    const actionAllowed = computed(() => mode.value === 'create' ? canCreate.value : !!selected.value && (mode.value === 'edit' ? canEdit(selected.value) : canDelete(selected.value)))
    const editor = useAdminEditor(actionAllowed)
    function open(next: typeof mode.value, role: RbacRole | null = null) {
      if (editor.busy.value || (next === 'create' ? !canCreate.value : !role || !(next === 'edit' ? canEdit(role) : canDelete(role)))) return
      editor.close()
      mode.value = next; selected.value = role
      code.value = role?.code ?? ''; name.value = role?.name ?? ''; description.value = role?.description ?? ''
      active.value = role?.active ?? true
      editor.feedback.value = ''; editor.opened.value = true
    }
    async function save() {
      const target = selected.value
      if (mode.value === 'create' ? !canCreate.value : !target || !(mode.value === 'edit' ? canEdit(target) : canDelete(target))) return
      if (mode.value !== 'delete' && (!code.value.trim() || !name.value.trim())) {
        editor.error.value = '请填写 Code 和名称。'; return
      }
      await editor.run(async (current, sameSession) => {
        const payload = { name: name.value, description: description.value,
          ...(mode.value === 'create' || target?.active !== undefined ? { active: active.value } : {}) }
        if (mode.value === 'create') await api.createRole!({ code: code.value, ...payload })
        else if (mode.value === 'edit') await api.updateRole!(target!.id!, payload)
        else await api.deleteRole!(target!.id!)
        if (!current()) return
        editor.opened.value = false
        try { await state.rbac.accessStore.reloadAccess() } catch { return }
        if (!sameSession()) return
        await state.reload()
        if (sameSession() && state.allowed.value) editor.feedback.value = state.error.value ? '操作已提交，但列表刷新失败，请重新加载核对。' : '操作成功，已刷新角色列表。'
      })
    }
    function field(label: string, value: typeof code, disabled = false) {
      return h('label', { class: 'rbac-admin-field' }, [label, h('input', { class: 'rbac-admin-input', value: value.value,
        'aria-label': label, disabled: editor.busy.value || disabled, required: label !== '描述',
        onInput: (event: Event) => { value.value = (event.target as HTMLInputElement).value } })])
    }
    return () => frame('角色列表', state.allowed.value, state.loading.value, state.error.value, state.reload, [
      message(editor.feedback),
      state.data.value && (state.data.value.length ? h('div', { class: 'rbac-admin-table-wrapper', tabindex: 0, role: 'region', 'aria-label': '角色列表' }, [h('table', { class: 'rbac-admin-table' }, [
        h('thead', [h('tr', ['Code', '名称', '启用', '权限数', '描述', '操作'].map(label => h('th', { scope: 'col' }, label)))]),
        h('tbody', state.data.value.map(role => h('tr', { key: role.code }, [
          h('th', { scope: 'row', class: 'rbac-admin-code' }, role.code), h('td', role.name ?? '—'),
          h('td', [h('span', { class: 'rbac-admin-badge' + (role.active ? ' rbac-admin-badge--success' : '') }, role.active === undefined ? '—' : role.active ? '已启用' : '已禁用')]),
          h('td', String(role.permissionCount ?? '—')), h('td', role.description ?? '—'),
          h('td', [h('div', { class: 'rbac-admin-toolbar' }, [
            canEdit(role) ? button('编辑', () => open('edit', role), editor.busy.value) : null,
            canDelete(role) ? button('删除', () => open('delete', role), editor.busy.value, 'danger') : null,
            protectedRole(role) && can('roleDelete') ? h('span', { class: 'rbac-admin-description' }, '系统保护角色不可删除') : null,
          ])]),
        ]))),
      ])]) : status('暂无角色', 'empty')),
      editor.opened.value ? h(AdminDialog, { title: mode.value === 'create' ? '新增角色' : mode.value === 'edit' ? '编辑角色' : '删除角色', busy: editor.busy.value, onClose: editor.close }, {
        default: () => [
          mode.value === 'delete' ? h('p', '确定删除角色「' + code.value + '」吗？') : [
            field('Code', code, mode.value === 'edit'), field('名称', name), field('描述', description),
            mode.value === 'edit' ? h('p', { class: 'rbac-admin-description' }, 'Role code 是身份映射契约，创建后不可修改。') : null,
            mode.value === 'create' || selected.value?.active !== undefined ? h('label', { class: 'rbac-admin-field' }, [
              h('input', { type: 'checkbox', class: 'rbac-admin-checkbox', 'aria-label': '启用', checked: active.value,
                disabled: editor.busy.value || !!(selected.value && protectedRole(selected.value)),
                onChange: (event: Event) => { active.value = (event.target as HTMLInputElement).checked } }), '启用',
            ]) : null,
          ],
          editor.error.value ? status(editor.error.value, 'error') : null,
          h('div', { class: 'rbac-admin-toolbar' }, [button('取消', editor.close, editor.busy.value),
            button(mode.value === 'delete' ? '确认删除' : '保存', save, editor.busy.value, mode.value === 'delete' ? 'danger' : 'primary')]),
        ],
      }) : null,
    ], editor.busy.value, '管理系统中的 RBAC 角色。', canCreate.value ? button('新增角色', () => open('create'), editor.busy.value, 'primary') : null)
  },
})
