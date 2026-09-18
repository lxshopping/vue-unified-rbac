import { inject } from 'vue'
import type { InjectionKey, Plugin } from 'vue'
import type { RbacAdminOptions, RbacAdminPermissions } from './types'
const adminKey: InjectionKey<Readonly<RbacAdminOptions>> = Symbol('scotec:rbac:admin')
export function validateAdminPermissions(permissions: RbacAdminPermissions): void {
  for (const key of ['roleView', 'roleManage', 'meView'] as const) {
    if (typeof permissions?.[key] !== 'string' || !permissions[key].trim()) throw new Error('Configure admin permission: ' + key)
  }
}
/** Optional installation only provides UI dependencies. Never mounts routes or menus. */
export function createRbacAdminPlugin(options: RbacAdminOptions): Plugin {
  validateAdminPermissions(options.permissions)
  const context = Object.freeze({ ...options, permissions: Object.freeze({ ...options.permissions }) })
  return { install(app) { app.provide(adminKey, context) } }
}
export function useRbacAdmin(): Readonly<RbacAdminOptions> {
  const context = inject(adminKey)
  if (!context) throw new Error('Install createRbacAdminPlugin before mounting admin views')
  return context
}
