import { defineComponent, h, ref, shallowRef, watch, onScopeDispose } from 'vue'
import type { AuditLog, AuditLogQuery } from '../api/types'
import { useRbacAdmin } from '../context'
import { AdminDialog, button, errorMessage, frame, status, useAdminResource } from './shared'

// Defense in depth for custom adapters; the backend remains responsible for safe snapshots.
function safeJson(value: unknown): string {
  return JSON.stringify(value, (key, item) => /password|token|secret|cookie|authorization|claims/i.test(key) ? '[REDACTED]' : item, 2)
}
export default defineComponent({
  name: 'AuditLogView',
  setup() {
    const { api } = useRbacAdmin()
    const query = ref<AuditLogQuery>({ page: 1, page_size: 50 })
    const filters = ref({ actor_name: '', action: '', target_type: '', target_id: '', result: '', created_after: '', created_before: '' })
    const filterError = ref('')
    const state = useAdminResource(() => {
      if (!api.listAuditLogs) throw new Error('Audit API is not configured')
      return api.listAuditLogs({ ...query.value })
    }, 'auditView')
    const detail = shallowRef<AuditLog | null>(null)
    const opened = ref(false), detailLoading = ref(false), detailError = ref('')
    let generation = 0
    function close() { generation++; opened.value = false; detail.value = null; detailLoading.value = false; detailError.value = '' }
    watch(() => [state.allowed.value, state.rbac.auth.getRevision()], close, { flush: 'sync' })
    onScopeDispose(close)
    async function show(id: number) {
      if (!state.allowed.value || !api.getAuditLog) return
      close(); opened.value = true; detailLoading.value = true
      const token = generation
      try {
        const result = await api.getAuditLog(id)
        if (token === generation && state.allowed.value) detail.value = result
      } catch (cause) { if (token === generation) detailError.value = errorMessage(cause, '详情加载失败，请关闭后重试。') }
      finally { if (token === generation) detailLoading.value = false }
    }
    async function search() {
      const next: AuditLogQuery = { page: 1, page_size: query.value.page_size }
      filterError.value = ''
      for (const key of ['actor_name', 'action', 'target_type', 'target_id'] as const) if (filters.value[key].trim()) next[key] = filters.value[key].trim()
      if (filters.value.result) next.result = filters.value.result as AuditLogQuery['result']
      for (const key of ['created_after', 'created_before'] as const) if (filters.value[key]) {
        const date = new Date(filters.value[key])
        if (!Number.isFinite(date.getTime())) { filterError.value = '请输入有效时间。'; return }
        next[key] = date.toISOString()
      }
      if (next.created_after && next.created_before && next.created_after > next.created_before) { filterError.value = '开始时间不能晚于结束时间。'; return }
      close(); query.value = next; await state.reload()
    }
    async function page(link: string | null | undefined) {
      if (!link || state.loading.value) return
      // Only consume the page number. Never navigate or send credentials to a response URL.
      try {
        const value = new URL(link, 'http://pagination.invalid').searchParams.get('page')
        const number = Number(value)
        if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 1) throw new Error()
        filterError.value = ''; close(); query.value = { ...query.value, page: number }; await state.reload()
      } catch { filterError.value = '分页响应无效，请重新查询。' }
    }
    function field(key: keyof typeof filters.value, label: string, type = 'text') {
      return h('label', { class: 'rbac-admin-field' }, [label, h('input', { class: 'rbac-admin-input', type, 'aria-label': label,
        value: filters.value[key], disabled: state.loading.value,
        onInput: (event: Event) => { filters.value[key] = (event.target as HTMLInputElement).value } })])
    }
    return () => frame('审计日志', state.allowed.value, state.loading.value, state.error.value, state.reload, state.allowed.value ? [
      h('form', { class: 'rbac-admin-audit-filters', onSubmit: (event: Event) => { event.preventDefault(); void search() } }, [
        field('actor_name', '操作人（精确匹配）'), field('action', '操作类型'), field('target_type', '对象类型'), field('target_id', '对象 ID'),
        h('label', { class: 'rbac-admin-field' }, ['结果', h('select', { class: 'rbac-admin-input', 'aria-label': '结果', value: filters.value.result, disabled: state.loading.value,
          onChange: (event: Event) => { filters.value.result = (event.target as HTMLSelectElement).value } },
        ['', 'success', 'denied', 'failed'].map(value => h('option', { value }, value || '全部')))]),
        field('created_after', '开始时间（本地时间）', 'datetime-local'), field('created_before', '结束时间（本地时间）', 'datetime-local'),
        button('查询', search, state.loading.value),
      ]),
      filterError.value ? status(filterError.value, 'error') : null,
      state.data.value ? [
        state.data.value.results.length ? h('div', { class: 'rbac-admin-table-wrapper', tabindex: 0, role: 'region', 'aria-label': '审计日志列表' }, [
          h('table', { class: 'rbac-admin-table' }, [
            h('thead', [h('tr', ['操作时间', '操作人', '操作类型', '操作对象', '结果', '详情'].map(text => h('th', { scope: 'col' }, text)))]),
            h('tbody', state.data.value.results.map(row => h('tr', { key: row.id }, [
              h('td', row.created_at), h('td', row.actor_name + ' (' + row.actor_type + ')'), h('td', row.action),
              h('td', row.target_name + ' (' + row.target_type + ': ' + row.target_id + ')'), h('td', row.result),
              h('td', api.getAuditLog ? button('详情 #' + row.id, () => show(row.id)) : '详情 API 未配置'),
            ]))),
          ]),
        ]) : status('暂无审计日志', 'empty'),
        h('div', { class: 'rbac-admin-toolbar' }, [h('span', '共 ' + state.data.value.count + ' 条，第 ' + query.value.page + ' 页'),
          button('上一页', () => page(state.data.value?.previous), !state.data.value.previous || state.loading.value),
          button('下一页', () => page(state.data.value?.next), !state.data.value.next || state.loading.value)]),
      ] : null,
      opened.value ? h(AdminDialog, { title: '审计详情', onClose: close }, { default: () => [
        detailLoading.value ? status('正在加载…') : null, detailError.value ? status(detailError.value, 'error') : null,
        detail.value ? [
          h('pre', { class: 'rbac-admin-json' }, safeJson(Object.fromEntries(Object.entries(detail.value).filter(([key]) => key !== 'before_data' && key !== 'after_data')))),
          h('h4', '变更前'), h('pre', { class: 'rbac-admin-json' }, safeJson(detail.value.before_data)),
          h('h4', '变更后'), h('pre', { class: 'rbac-admin-json' }, safeJson(detail.value.after_data)),
        ] : null, button('关闭', close),
      ] }) : null,
    ] : null, false, '只读审计记录。筛选条件按精确匹配组合查询。')
  },
})
