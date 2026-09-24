import { computed, defineComponent, h, onActivated, onMounted, onScopeDispose, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { Ref, VNodeChild } from 'vue'
import { useRbac } from '../../plugin'
import { useRbacAdmin } from '../context'

export function errorMessage(cause: unknown, fallback = '操作失败，请重试。'): string {
  const data = (cause as { response?: { data?: unknown } })?.response?.data
  function flatten(value: unknown, prefix = ''): string[] {
    if (typeof value === 'string') return [prefix + value]
    if (Array.isArray(value)) return value.flatMap(item => flatten(item, prefix))
    if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, val]) =>
      flatten(val, prefix + (key === 'detail' || key === 'non_field_errors' ? '' : key + ': ')))
    return []
  }
  return flatten(data).join('；') || fallback
}
export function roleSourceLabel(source?: string): string {
  return source === 'rbac_db' ? 'RBAC Database' : source === 'keycloak' ? 'Keycloak' : source ?? '—'
}
export function useAdminResource<T>(loader: () => Promise<T>, permission: 'roleView' | 'userRoleView' = 'roleView') {
  const rbac = useRbac()
  const admin = useRbacAdmin()
  const allowed = computed(() => rbac.accessStore.hasPermission(admin.permissions[permission]))
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
    } catch (cause) {
      if (current === version) error.value = errorMessage(cause, '加载失败，请重试。')
    } finally { if (current === version) loading.value = false }
  }
  watch(() => [allowed.value, rbac.auth.getRevision()], () => { void reload() }, { immediate: true, flush: 'sync' })
  let activated = false
  onActivated(() => {
    if (activated) void reload()
    activated = true
  })
  onScopeDispose(() => { version++ })
  return { rbac, admin, allowed, data, loading, error, reload }
}
/** A mounted, authorized session owns each edit; late responses cannot reopen it. */
export function useAdminEditor(allowed: Ref<boolean>) {
  const { auth } = useRbac()
  const busy = ref(false)
  const error = ref('')
  const feedback = ref('')
  const opened = ref(false)
  let generation = 0
  let alive = true
  function close() { generation++; opened.value = false; error.value = '' }
  watch(() => [allowed.value, auth.getRevision()], () => { close(); feedback.value = '' }, { flush: 'sync' })
  onScopeDispose(() => { alive = false; generation++ })
  async function run(work: (current: () => boolean, sameSession: () => boolean) => Promise<void>) {
    if (busy.value || !allowed.value) return
    busy.value = true
    error.value = ''
    const token = generation
    const revision = auth.getRevision()
    const current = () => alive && generation === token && auth.getRevision() === revision && allowed.value
    try { await work(current, () => alive && auth.getRevision() === revision) }
    catch (cause) { if (current()) error.value = errorMessage(cause) }
    finally { if (alive) busy.value = false }
  }
  return { busy, error, feedback, opened, close, run }
}
export const AdminDialog = defineComponent({
  props: { title: { type: String, required: true }, busy: Boolean },
  emits: ['close'],
  setup(props, { slots, emit }) {
    const element = ref<HTMLDialogElement>()
    let previous: HTMLElement | null = null
    onMounted(() => {
      previous = typeof document === 'undefined' ? null : document.activeElement as HTMLElement
      element.value?.showModal?.()
    })
    onUnmounted(() => { if (previous?.isConnected) previous.focus() })
    return () => h('dialog', { ref: element, class: 'rbac-admin-dialog', 'aria-label': props.title,
      'aria-busy': props.busy, onCancel: (event: Event) => { event.preventDefault(); if (!props.busy) emit('close') } }, [
      h('h3', { class: 'rbac-admin-section-title' }, props.title), slots.default?.(),
    ])
  },
})
export function button(label: string, onClick: () => unknown, disabled = false, kind = 'secondary') {
  return h('button', { class: 'rbac-admin-button rbac-admin-button--' + kind, type: 'button', disabled, onClick }, label)
}
export function frame(title: string, allowed: boolean, loading: boolean, error: string,
  reload: () => Promise<void>, content: VNodeChild, busy = false, description = '', actions?: VNodeChild) {
  return h('section', { class: 'rbac-admin-page', 'aria-busy': loading || busy }, [
    h('div', { class: 'rbac-admin-header' }, [h('div', [h('h2', { class: 'rbac-admin-title' }, title), h('p', { class: 'rbac-admin-description' }, description)]), allowed ? h('div', { class: 'rbac-admin-toolbar' }, [actions, button('重新加载', reload, loading || busy)]) : null]),
    h('div', { class: 'rbac-admin-card' }, !allowed ? [status('权限不足', 'error')] : [
      loading ? status('正在加载…') : null, error ? status(error, 'error') : null, content,
    ]),
  ])
}
export function message(text: Ref<string>) { return text.value ? status(text.value, 'success') : null }
export function status(text: string, kind = 'loading') {
  return h('div', { class: kind === 'error' ? 'rbac-admin-alert rbac-admin-alert--error' : kind === 'empty' ? 'rbac-admin-empty' : 'rbac-admin-state rbac-admin-state--' + kind, role: kind === 'error' ? 'alert' : 'status' }, text)
}
