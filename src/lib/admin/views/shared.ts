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
  reload: () => Promise<void>, content: VNodeChild, busy = false) {
  return h('section', { class: 'rbac-admin', 'aria-busy': loading || busy }, [
    h('h2', title),
    !allowed ? h('p', { role: 'alert' }, '权限不足') : [
      h('button', { type: 'button', disabled: loading || busy, onClick: reload }, '重新加载'),
      loading ? h('p', { role: 'status' }, '正在加载…') : null,
      error ? h('p', { role: 'alert' }, error) : null,
      content,
    ],
  ])
}
export function message(text: Ref<string>) {
  return text.value ? h('p', { role: 'status' }, text.value) : null
}
