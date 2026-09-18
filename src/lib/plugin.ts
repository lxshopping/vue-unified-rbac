import { inject } from 'vue'
import { HybridAuthManager } from './auth/hybrid-manager'
import type { App, InjectionKey } from 'vue'
import { initializeAccessStore } from './access/store'
import { createPermissionDirective } from './directives/permission'
import type { RbacContext, RbacPlugin, RbacPluginOptions } from './types'

const rbacKey: InjectionKey<RbacContext> = Symbol('scotec:rbac')

export function createRbacPlugin(options: RbacPluginOptions): RbacPlugin {
  if (options.auth instanceof HybridAuthManager && options.mode && options.auth.mode !== options.mode) {
    throw new Error('Plugin mode must match auth manager mode')
  }
  const auth = options.auth instanceof HybridAuthManager ? options.auth : new HybridAuthManager({
    ...options.hybrid, mode: options.mode ?? 'sso', sso: options.auth,
  })
  const accessStore = initializeAccessStore(options.pinia, { auth, loadAccess: options.loadAccess })
  auth.onSessionChange(() => accessStore.clearAccess())
  const context: RbacContext = {
    auth,
    accessStore,
    async logout() {
      accessStore.clearAccess()
      await auth.logout()
    },
  }
  return {
    ...context,
    install(app: App) {
      app.provide(rbacKey, context)
      app.directive('permission', createPermissionDirective(accessStore))
    },
  }
}

export function useRbac(): RbacContext {
  const context = inject(rbacKey)
  if (!context) throw new Error('请先通过 app.use(rbac) 安装 RBAC Plugin。')
  return context
}
