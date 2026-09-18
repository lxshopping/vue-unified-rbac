import { inject } from 'vue'
import { createPinia } from 'pinia'
import axios from 'axios'
import { HybridAuthManager } from './auth/hybrid-manager'
import type { App, InjectionKey } from 'vue'
import { initializeAccessStore } from './access/store'
import { createPermissionDirective } from './directives/permission'
import { installAuthInterceptor } from './axios/interceptor'
import type { RbacContext, RbacPlugin, RbacPluginOptions } from './types'

const rbacKey: InjectionKey<RbacContext> = Symbol('scotec:rbac')
export function createRbacPlugin(options: RbacPluginOptions): RbacPlugin {
  const configured = options.auth && !('init' in options.auth)
    ? options.auth : undefined
  const auth = options.auth instanceof HybridAuthManager ? options.auth : new HybridAuthManager(
    configured ?? { ...options.hybrid, mode: options.mode ?? 'sso',
      localProvider: options.localProvider ?? options.hybrid?.localProvider,
      sso: options.auth && 'init' in options.auth ? options.auth : undefined },
  )
  if (options.mode && auth.mode !== options.mode) throw new Error('Plugin mode must match auth manager mode')
  const pinia = options.pinia ?? createPinia()
  // Existing host loaders/clients keep their installation policy unchanged.
  const client = options.loadAccess ? undefined : options.instance ?? axios.create()
  const accessStore = initializeAccessStore(pinia, {
    auth,
    loadAccess: options.loadAccess ?? (async () => (await client!.get(options.accessEndpoint ?? '/api/rbac/me')).data),
  })
  if (client) installAuthInterceptor(client, auth)
  auth.onSessionChange(() => accessStore.clearAccess())
  auth.bindAccessLoader(() => accessStore.loadAccess())
  const context: RbacContext = {
    auth, accessStore, access: accessStore,
    async restoreSession() {
      if (auth.source === null && auth.mode !== 'sso') auth.setAuthSource('local')
      const revision = auth.getRevision()
      try { await auth.init() } catch (error) {
        if (revision === auth.getRevision()) await auth.handleAuthError(error)
        throw error
      }
      if (revision !== auth.getRevision()) return
      await accessStore.loadAccess()
    },
    async logout() {
      accessStore.clearAccess()
      await auth.logout()
    },
  }
  return {
    ...context,
    install(app: App) {
      if (!options.pinia) app.use(pinia)
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
