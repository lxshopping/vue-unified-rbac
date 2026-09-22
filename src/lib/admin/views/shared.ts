import { computed, h, onScopeDispose, ref, shallowRef, watch } from 'vue'
import type { Ref, VNodeChild } from 'vue'
import { useRbac } from '../../plugin'
import { useRbacAdmin } from '../context'

export function useAdminResource<T>(loader: () => Promise<T>) {
  const rbac = useRbac()
  const admin = useRbacAdmin()
  const allowed = computed(() => rbac.accessStore.hasPermission(admin.permissions.roleView))
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref('')
  let version = 0
  async function reload() {
    const current = ++version
    data.value = null
    error.value = ''
    loading.value = allowed.value
    if (!allowed.value) return
    try {
      const result = await loader()
      if (current === version && allowed.value) data.value = result
    } catch {
      if (current === version) error.value = '加载失败，请重试。'
    } finally { if (current === version) loading.value = false }
  }
  // Permission revocation and same-source session changes discard pending admin data.
  watch(() => [allowed.value, rbac.auth.getRevision()], () => { void reload() }, { immediate: true, flush: 'sync' })
  onScopeDispose(() => { version++ })
  return { rbac, admin, allowed, data, loading, error, reload }
}
export function frame(title: string, allowed: boolean, loading: boolean, error: string,
  reload: () => Promise<void>, content: VNodeChild, busy = false, description = '') {
  return h('section', { class: 'rbac-admin-page', 'aria-busy': loading || busy }, [
    h('div', { class: 'rbac-admin-header' }, [h('div', [h('h2', { class: 'rbac-admin-title' }, title), h('p', { class: 'rbac-admin-description' }, description)]), allowed ? h('div', { class: 'rbac-admin-toolbar' }, [h('button', { class: 'rbac-admin-button rbac-admin-button--secondary', type: 'button', disabled: loading || busy, onClick: reload }, '重新加载')]) : null]),
    h('div', { class: 'rbac-admin-card' }, !allowed ? [status('权限不足', 'error')] : [
      loading ? status('正在加载…') : null,
      error ? status(error, 'error') : null,
      content,
    ]),
  ])
}
export function message(text: Ref<string>) {
  return text.value ? status(text.value, 'success') : null
}

export function status(text: string, kind = 'loading') {
  return h('div', { class: kind === 'error' ? 'rbac-admin-alert rbac-admin-alert--error' : kind === 'empty' ? 'rbac-admin-empty' : 'rbac-admin-state rbac-admin-state--' + kind, role: kind === 'error' ? 'alert' : 'status' }, text)
}
