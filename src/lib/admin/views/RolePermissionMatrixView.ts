import { computed, defineComponent, h, onScopeDispose, ref, watch } from 'vue'
import { useRbacAdmin } from '../context'
import { frame, message, useAdminResource } from './shared'

export default defineComponent({
  name: 'RolePermissionMatrixView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(async () => {
      const [roles, permissions] = await Promise.all([api.listRoles(), api.listPermissions()])
      const grants = await Promise.all(roles.map(role => api.getRolePermissions(role.code)))
      return { roles, permissions, grants }
    })
    const draft = ref<string[][]>([])
    const saving = ref(false)
    const feedback = ref('')
    const saveError = ref('')
    let alive = true
    onScopeDispose(() => { alive = false })
    watch(state.data, value => { draft.value = value?.grants.map(codes => [...codes]) ?? [] }, { flush: 'sync' })
    watch(() => state.rbac.auth.source, () => { feedback.value = ''; saveError.value = '' })
    const editable = computed(() => state.allowed.value && state.admin.editable === true &&
      api.supportsUpdates === true && state.rbac.accessStore.hasPermission(state.admin.permissions.roleManage))
    async function save(index: number) {
      const data = state.data.value
      if (!data || !editable.value || saving.value || state.loading.value) return
      saving.value = true
      feedback.value = ''
      saveError.value = ''
      const revision = state.rbac.auth.getRevision()
      const current = () => alive && revision === state.rbac.auth.getRevision()
      try {
        // Preserve codes not yet included in the backend catalogue; never silently delete them.
        await api.updateRolePermissions(data.roles[index].code, [...draft.value[index]])
        if (!current()) return
        await state.rbac.accessStore.reloadAccess()
        if (!current()) return
        await state.reload()
        if (current()) {
          if (state.error.value) saveError.value = '保存已提交，但重新加载失败，请重试并核对服务端结果。'
          else feedback.value = '保存成功，已重新加载服务端数据。'
        }
      } catch {
        if (current()) {
          draft.value = data.grants.map(codes => [...codes])
          await state.reload()
          if (current()) saveError.value = '保存或权限刷新失败；已撤销本地编辑，请核对服务端结果。'
        }
      } finally { if (alive) saving.value = false }
    }
    function toggle(index: number, code: string, checked: boolean) {
      if (!editable.value || saving.value) return
      const codes = draft.value[index]
      draft.value[index] = checked ? [...new Set([...codes, code])] : codes.filter(value => value !== code)
    }
    return () => {
      const data = state.data.value
      return frame('角色权限矩阵', state.allowed.value, state.loading.value,
        state.error.value || saveError.value, state.reload, [
          message(feedback),
          !editable.value ? h('p', '只读模式') : null,
          saving.value ? h('p', { role: 'status' }, '正在保存…') : null,
          data && (!data.roles.length || !data.permissions.length ? h('p', '暂无角色或权限') :
            h('div', { style: { overflowX: 'auto' } }, [h('table', { class: 'rbac-admin-matrix' }, [
              h('thead', [h('tr', [h('th', { scope: 'col' }, '角色'),
                ...data.permissions.map(p => h('th', { scope: 'col', key: p.code }, p.code)),
                h('th', { scope: 'col' }, '操作')])]),
              h('tbody', data.roles.map((role, index) => h('tr', { key: role.code }, [
                h('th', { scope: 'row' }, role.name ?? role.code),
                ...data.permissions.map(p => h('td', { key: p.code }, [h('input', {
                  type: 'checkbox', 'aria-label': role.code + ': ' + p.code,
                  checked: draft.value[index]?.includes(p.code) ?? false,
                  disabled: !editable.value || saving.value,
                  onChange: (event: Event) => toggle(index, p.code, (event.target as HTMLInputElement).checked),
                })])),
                h('td', [h('button', { type: 'button', disabled: !editable.value || saving.value,
                  onClick: () => save(index) }, '保存 ' + role.code)]),
              ]))),
            ])])),
        ], saving.value)
    }
  },
})
