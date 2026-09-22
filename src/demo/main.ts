import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { authenticationError, auth } from './auth/keycloak'
import { createRbacPlugin, installRbacGuard } from '@scotec/vue-unified-rbac'
import { fetchMyAccess } from './api/rbac'
import './style.css'
import '@scotec/vue-unified-rbac/style.css'

async function bootstrap() {
  try {
    await auth.init()

    const app = createApp(App)
    const pinia = createPinia()

    app.use(pinia)
    const rbac = createRbacPlugin({ pinia, auth, loadAccess: fetchMyAccess })
    app.use(rbac)
    const { accessStore } = rbac
    watch(authenticationError, (error) => {
      if (error) accessStore.clearAccess()
    }, { flush: 'sync' })

    // 首页菜单也需要权限；登录后加载一次，失败由 Layout 显示并提供显式重试。
    try {
      await accessStore.loadMyAccess()
    } catch {
      // 401 已交给认证层处理；403 / 网络异常由 AccessStore 记录。
    }

    // Keycloak 会清理回调 URL，必须在它完成之后再创建 Web History / Router。
    const { default: router } = await import('./router')
    installRbacGuard(router, { accessStore, forbiddenRoute: '/403', accessErrorRoute: '/' })
    app.use(router)
    await router.isReady()

    app.mount('#app')
  } catch (error) {
    const root = document.querySelector('#app')
    if (root) {
      const message = document.createElement('p')
      message.setAttribute('role', 'alert')
      message.textContent = `应用启动失败：${error instanceof Error ? error.message : '请检查 SSO 服务与配置。'}`
      const retry = document.createElement('button')
      retry.textContent = '重新加载'
      retry.onclick = () => window.location.reload()
      root.replaceChildren(message, retry)
    }
  }
}

if (new URLSearchParams(window.location.search).has('admin-demo')) {
  void import('./admin/bootstrap').then(({ bootstrapAdminDemo }) => bootstrapAdminDemo())
} else if (import.meta.env.VITE_RBAC_V3 === 'true') {
  void import('./v3/bootstrap').then(({ bootstrapV3 }) => bootstrapV3())
} else {
  void bootstrap()
}
