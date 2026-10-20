import { computed, defineComponent, h, onScopeDispose, ref, watch } from 'vue'
import { useRbacAdmin } from '../context'
import { AdminDialog, button, errorMessage, frame, message, status, useAdminResource } from './shared'

export default defineComponent({
  name: 'RolePermissionMatrixView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(async () => {
      const [roles, permissions] = await Promise.all([api.listRoles(), api.listPermissions()])
      const grants = await Promise.all(roles.map(role => api.getRolePermissions(role.code)))
      return { roles, permissions, grants }
    }, ['roleView', 'permissionView', 'rolePermissionView'])
    const draft = ref<string[][]>([])
    const saving = ref(false)
    const confirming = ref<number | null>(null)
    watch(() => [state.allowed.value, state.rbac.auth.getRevision(), state.data.value], () => { confirming.value = null }, { flush: 'sync' })
    const feedback = ref('')
    const saveError = ref('')
    let alive = true
    onScopeDispose(() => { alive = false })
    watch(state.data, value => { draft.value = value?.grants.map(codes => [...codes]) ?? [] }, { flush: 'sync' })
    watch(() => state.rbac.auth.source, () => { feedback.value = ''; saveError.value = '' })
    const editable = computed(() => state.allowed.value && state.admin.editable === true &&
      api.supportsUpdates !== false && typeof api.updateRolePermissions === 'function' && state.rbac.accessStore.hasPermission(state.admin.permissions.rolePermissionUpdate))
    async function save(index: number, confirmed = false) {
      const data = state.data.value
      if (!data || !editable.value || saving.value || state.loading.value) return
      const removed = data.grants[index].filter(code => !draft.value[index].includes(code))
      if (removed.length && !confirmed) { confirming.value = index; return }
      confirming.value = null
      saving.value = true
      feedback.value = ''
      saveError.value = ''
      const revision = state.rbac.auth.getRevision()
      const current = () => alive && revision === state.rbac.auth.getRevision()
      try {
        // Preserve codes not yet included in the backend catalogue; never silently delete them.
        await api.updateRolePermissions!(data.roles[index].code, [...draft.value[index]])
        if (!current()) return
        await state.rbac.accessStore.reloadAccess()
        if (!current()) return
        await state.reload()
        if (current()) {
          if (state.error.value) saveError.value = '保存已提交，但重新加载失败，请重试并核对服务端结果。'
          else feedback.value = '保存成功，已重新加载服务端数据。'
        }
      } catch (cause) {
        if (current()) {
          draft.value = data.grants.map(codes => [...codes])
          await state.reload()
          if (current()) saveError.value = errorMessage(cause, '保存或权限刷新失败；已撤销本地编辑，请核对服务端结果。')
        }
      } finally { if (alive) saving.value = false }
    }
    function toggle(index: number, code: string, checked: boolean) {
      if (!editable.value || saving.value || confirming.value !== null) return
      const codes = draft.value[index]
      draft.value[index] = checked ? [...new Set([...codes, code])] : codes.filter(value => value !== code)
    }
    return () => {
      const data = state.data.value
      return frame('角色权限矩阵', state.allowed.value, state.loading.value,
        [saveError.value, state.error.value].filter(Boolean).join('；'), state.reload, [
          message(feedback),
          confirming.value !== null && data && editable.value ? h(AdminDialog, { title: '确认撤销角色权限', onClose: () => { confirming.value = null } }, {
            default: () => {
              const index = confirming.value!
              const removed = data.grants[index].filter(code => !draft.value[index].includes(code))
              const critical = removed.some(code => [state.admin.permissions.rolePermissionUpdate, state.admin.permissions.userRoleUpdate].includes(code))
              return [h('p', '将全量替换角色「' + data.roles[index].code + '」的权限，撤销：' + removed.join(', ')),
                critical ? status('此操作撤销关键管理权限，可能导致管理员无法继续授权。', 'error') : null,
                state.rbac.accessStore.roles.includes(data.roles[index].code) ? status('警告：你当前持有此角色，操作可能撤销你自己的权限。', 'error') : null,
                h('p', '后端仍将验证并可能拒绝此操作。'),
                button('取消', () => { confirming.value = null }), button('确认撤销', () => save(index, true), false, 'danger')]
            },
          }) : null,
          !editable.value ? h('p', { class: 'rbac-admin-description' }, '只读模式') : null,
          saving.value ? status('正在保存…') : null,
          data && (!data.roles.length || !data.permissions.length ? status('暂无角色或权限', 'empty') :
            h('div', { class: 'rbac-admin-table-wrapper rbac-admin-table-wrapper--matrix', tabindex: 0, role: 'region', 'aria-label': '角色权限矩阵' }, [h('table', { class: 'rbac-admin-table rbac-admin-matrix' }, [
              h('thead', [h('tr', [h('th', { scope: 'col' }, '权限 Code'),
                ...data.roles.map(role => h('th', { scope: 'col', key: role.code, class: 'rbac-admin-code' }, role.code))])]),
              h('tbody', data.permissions.map(p => h('tr', { key: p.code }, [
                h('th', { scope: 'row', class: 'rbac-admin-code' }, p.code),
                ...data.roles.map((role, index) => {
                  const granted = draft.value[index]?.includes(p.code) ?? false
                  return h('td', { key: role.code }, [editable.value ? h('input', {
                    class: 'rbac-admin-checkbox', type: 'checkbox', 'aria-label': role.code + ': ' + p.code,
                    checked: granted, disabled: saving.value || confirming.value !== null,
                    onChange: (event: Event) => toggle(index, p.code, (event.target as HTMLInputElement).checked),
                  }) : h('span', { class: granted ? 'rbac-admin-permission-enabled' : 'rbac-admin-permission-disabled', role: 'img', 'aria-label': granted ? '有权限' : '无权限' }, granted ? '✓' : '—')])
                }),
              ]))),
              editable.value ? h('tfoot', [h('tr', [h('th', { scope: 'row' }, '操作'),
                ...data.roles.map((role, index) => h('td', { key: role.code }, [h('button', {
                  class: 'rbac-admin-button rbac-admin-button--primary', type: 'button', disabled: saving.value,
                  onClick: () => save(index),
                }, '保存 ' + role.code)])),
              ])]) : null,
            ])])),
        ], saving.value, '查看不同角色当前拥有的权限。')
    }
  },
})
