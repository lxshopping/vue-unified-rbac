import { defineComponent, h } from 'vue'
import { useRbac } from '../../plugin'
import { useRbacAdmin } from '../context'

export default defineComponent({
  name: 'MyAccessView',
  setup() {
    const { accessStore: store } = useRbac()
    const admin = useRbacAdmin()
    async function reload() {
      // Allows recovery after a failed /me without revealing old data.
      try { await store.loadAccess() } catch { /* Store owns the only error/access state. */ }
    }
    return () => h('section', { class: 'rbac-admin', 'aria-busy': store.loading }, [
      h('h2', '当前用户权限'),
      h('button', { type: 'button', disabled: store.loading, onClick: reload }, '刷新权限'),
      store.loading ? h('p', { role: 'status' }, '正在加载…') : null,
      store.error ? h('p', { role: 'alert' }, '权限加载失败，请重试。') : null,
      !store.hasPermission(admin.permissions.meView) ? h('p', { role: 'alert' }, '权限不足') : [
        h('p', 'username: ' + store.username), h('p', 'auth_source: ' + (store.authSource ?? '—')),
        h('h3', '角色'), store.roles.length ? h('ul', store.roles.map(code => h('li', { key: code }, code))) : h('p', '无角色'),
        h('h3', '权限'), store.permissions.length ? h('ul', store.permissions.map(code => h('li', { key: code }, code))) : h('p', '无权限'),
      ],
    ])
  },
})
