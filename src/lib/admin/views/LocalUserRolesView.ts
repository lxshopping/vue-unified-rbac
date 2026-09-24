import { computed, defineComponent, h, ref, shallowRef } from 'vue'
import { useRbacAdmin } from '../context'
import type { LocalRbacUser, RbacRole } from '../api/types'
import { AdminDialog, button, frame, message, roleSourceLabel, status, useAdminEditor, useAdminResource } from './shared'

export default defineComponent({
  name: 'LocalUserRolesView',
  setup() {
    const { api } = useRbacAdmin()
    const state = useAdminResource(async () => {
      if (!api.listLocalUsers) throw new Error('Local user API is not configured')
      return (await api.listLocalUsers()).filter(isLocal)
    }, 'userRoleView')
    function isLocal(user: LocalRbacUser) {
      return (!user.authSource || user.authSource === 'local') && (!user.roleSource || user.roleSource === 'rbac_db')
    }
    const canManage = computed(() => state.allowed.value && state.admin.editable === true &&
      state.rbac.accessStore.hasPermission(state.admin.permissions.userRoleUpdate) &&
      !!api.getLocalUserRoles && !!api.updateLocalUserRoles)
    const editor = useAdminEditor(canManage)
    const selected = shallowRef<LocalRbacUser | null>(null)
    const roles = shallowRef<RbacRole[]>([])
    const draft = ref<string[]>([])
    const ready = ref(false)
    async function load() {
      const user = selected.value
      if (!user || !isLocal(user)) return
      ready.value = false
      await editor.run(async current => {
        const [candidates, assigned] = await Promise.all([api.listRoles(), api.getLocalUserRoles!(user.id)])
        if (!current()) return
        roles.value = candidates; draft.value = [...assigned]; ready.value = true
      })
    }
    async function open(user: LocalRbacUser) {
      if (!canManage.value || editor.busy.value || !isLocal(user)) return
      editor.close(); editor.feedback.value = ''; selected.value = user
      roles.value = []; draft.value = []; ready.value = false; editor.opened.value = true
      await load()
    }
    async function save() {
      const user = selected.value
      if (!canManage.value || !ready.value || !user || !isLocal(user)) return
      await editor.run(async (current, sameSession) => {
        await api.updateLocalUserRoles!(user.id, [...draft.value])
        if (!current()) return
        editor.opened.value = false
        // A local administrator may have changed their own grants. Revalidate the sole AccessStore.
        try { await state.rbac.accessStore.reloadAccess() }
        catch { return } // AccessStore owns the error and revokes access.
        if (!sameSession()) return
        await state.reload()
        if (sameSession() && state.allowed.value) editor.feedback.value = state.error.value
          ? '角色已保存，但列表刷新失败，请重新加载核对。' : '角色保存成功，已刷新用户列表。'
      })
    }
    return () => frame('本地用户角色', state.allowed.value, state.loading.value, state.error.value, state.reload, [
      message(editor.feedback),
      !api.listLocalUsers ? status('请配置本地用户 Admin API。', 'error') : null,
      state.data.value && (state.data.value.length ? h('div', { class: 'rbac-admin-table-wrapper', tabindex: 0, role: 'region', 'aria-label': '本地用户角色' }, [
        h('table', { class: 'rbac-admin-table' }, [
          h('thead', [h('tr', ['用户名', '状态', '当前角色', '角色来源', '操作'].map(label => h('th', { scope: 'col' }, label)))]),
          h('tbody', state.data.value.map(user => h('tr', { key: user.id }, [
            h('th', { scope: 'row' }, user.username),
            h('td', user.active === undefined ? '—' : user.active ? '已启用' : '已禁用'),
            h('td', user.roles.length ? h('ul', { class: 'rbac-admin-tags' }, user.roles.map(code => h('li', { class: 'rbac-admin-badge rbac-admin-code', key: code }, code))) : '无角色'),
            h('td', roleSourceLabel(user.roleSource)),
            h('td', canManage.value ? button('管理角色', () => open(user), editor.busy.value) : '只读'),
          ]))),
        ]),
      ]) : status('暂无本地用户', 'empty')),
      editor.opened.value && canManage.value ? h(AdminDialog, { title: '用户：' + selected.value?.username, busy: editor.busy.value, onClose: editor.close }, {
        default: () => [
          editor.busy.value ? status('正在处理…') : null,
          editor.error.value ? status(editor.error.value, 'error') : null,
          ready.value ? [
            roles.value.length ? h('div', { class: 'rbac-admin-role-options' }, roles.value.map(role => h('label', { class: 'rbac-admin-field', key: role.code }, [
              h('input', { type: 'checkbox', class: 'rbac-admin-checkbox', 'aria-label': role.code,
                checked: draft.value.includes(role.code), disabled: editor.busy.value,
                onChange: (event: Event) => {
                  if (!canManage.value || editor.busy.value) return
                  draft.value = (event.target as HTMLInputElement).checked ? [...new Set([...draft.value, role.code])] : draft.value.filter(code => code !== role.code)
                } }), role.code + (role.name ? ' · ' + role.name : '') + (role.active === false ? '（已禁用）' : ''),
            ]))) : status('暂无可选角色', 'empty'),
            draft.value.some(code => !roles.value.some(role => role.code === code)) ? h('p', { class: 'rbac-admin-description' }, '目录外的已有角色会保留：' + draft.value.filter(code => !roles.value.some(role => role.code === code)).join(', ')) : null,
          ] : !editor.busy.value ? button('重试', load) : null,
          h('div', { class: 'rbac-admin-toolbar' }, [button('取消', editor.close, editor.busy.value),
            ready.value ? button('保存', save, editor.busy.value, 'primary') : null]),
        ],
      }) : null,
    ], editor.busy.value, '仅管理 Django 本地用户的角色。SSO 用户角色由 Keycloak 管理。')
  },
})
