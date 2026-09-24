import { defineComponent, h } from 'vue'
import { useRbac } from '../../plugin'
import { useRbacAdmin } from '../context'
import { roleSourceLabel, status } from './shared'

export default defineComponent({
  name: 'MyAccessView',
  setup() {
    const { accessStore: store } = useRbac()
    const admin = useRbacAdmin()
    async function reload() {
      // Allows recovery after a failed /me without revealing old data.
      try { await store.loadAccess() } catch { /* Store owns the only error/access state. */ }
    }
    return () => h('section', { class: 'rbac-admin-page', 'aria-busy': store.loading }, [
      h('div', { class: 'rbac-admin-header' }, [
        h('div', [h('h2', { class: 'rbac-admin-title' }, '当前用户权限'), h('p', { class: 'rbac-admin-description' }, '查看当前登录用户的身份、角色和权限。')]),
        h('div', { class: 'rbac-admin-toolbar' }, [h('button', { class: 'rbac-admin-button rbac-admin-button--secondary', type: 'button', disabled: store.loading, onClick: reload }, '刷新权限')]),
      ]),
      store.loading ? status('正在加载…') : null,
      store.error ? status('权限加载失败，请重试。', 'error') : null,
      !store.hasPermission(admin.permissions.meView) ? status('权限不足', 'error') : [
        h('div', { class: 'rbac-admin-card' }, [
          h('h3', { class: 'rbac-admin-section-title' }, '用户信息'),
          h('dl', { class: 'rbac-admin-user-info' }, [h('dt', '用户名'), h('dd', store.username), h('dt', '认证来源'), h('dd', store.authSource ?? '—'), h('dt', '角色来源'), h('dd', roleSourceLabel(store.me?.role_source ?? store.me?.roleSource))]),
        ]),
        h('div', { class: 'rbac-admin-card' }, [
          h('h3', { class: 'rbac-admin-section-title' }, '角色'),
          store.authSource === 'sso' && (store.me?.role_source ?? store.me?.roleSource) === 'keycloak' ? h('p', { class: 'rbac-admin-description' }, 'SSO 用户角色由 Keycloak 管理。') : null,
          store.roles.length ? h('ul', { class: 'rbac-admin-tags' }, store.roles.map(code => h('li', { class: 'rbac-admin-badge rbac-admin-code', key: code }, code))) : status('无角色', 'empty'),
        ]),
        h('div', { class: 'rbac-admin-card' }, [
          h('h3', { class: 'rbac-admin-section-title' }, '权限'),
          store.permissions.length ? h('ul', { class: 'rbac-admin-tags' }, store.permissions.map(code => h('li', { class: 'rbac-admin-permission-tag rbac-admin-code', key: code }, code))) : status('无权限', 'empty'),
        ]),
      ],
    ])
  },
})
