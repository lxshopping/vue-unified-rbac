import { inject } from 'vue'
import type { App, InjectionKey } from 'vue'
import { initializeAccessStore } from './access/store'
import { createPermissionDirective } from './directives/permission'
import type { RbacContext, RbacPlugin, RbacPluginOptions } from './types'

const rbacKey: InjectionKey<RbacContext> = Symbol('scotec:rbac')

export function createRbacPlugin(options: RbacPluginOptions): RbacPlugin {
  const accessStore = initializeAccessStore(options.pinia, options)
  const context: RbacContext = {
    auth: options.auth,
    accessStore,
    async logout() {
      accessStore.clearAccess()
      await options.auth.logout()
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
