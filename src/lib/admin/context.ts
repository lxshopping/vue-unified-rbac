import { inject } from 'vue'
import type { InjectionKey, Plugin } from 'vue'
import type { RbacAdminOptions, RbacAdminPermissions } from './types'
type ResolvedOptions = Omit<RbacAdminOptions, 'permissions'> & { permissions: Required<RbacAdminPermissions> }
const adminKey: InjectionKey<Readonly<ResolvedOptions>> = Symbol('scotec:rbac:admin')
export function validateAdminPermissions(permissions: RbacAdminPermissions): void {
  for (const [key, value] of Object.entries(permissions)) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) throw new Error('Configure admin permission: ' + key)
  }
}
export function resolveAdminPermissions(permissions: RbacAdminPermissions): Required<RbacAdminPermissions> {
  validateAdminPermissions(permissions)
  return {
    auditView: permissions.auditView ?? 'rbac.audit.view',
    roleView: permissions.roleView ?? 'rbac.role.view',
    rolePermissionView: permissions.rolePermissionView ?? 'rbac.role_permission.view',
    rolePermissionUpdate: permissions.rolePermissionUpdate ?? 'rbac.role_permission.update',
    permissionView: permissions.permissionView ?? 'rbac.permission.view',
    roleCreate: permissions.roleCreate ?? 'rbac.role.create',
    roleUpdate: permissions.roleUpdate ?? 'rbac.role.update',
    roleDelete: permissions.roleDelete ?? 'rbac.role.delete',
    userRoleView: permissions.userRoleView ?? 'rbac.user_role.view',
    userRoleUpdate: permissions.userRoleUpdate ?? 'rbac.user_role.update',
  }
}
/** Optional installation only provides UI dependencies. Never mounts routes or menus. */
export function createRbacAdminPlugin(options: RbacAdminOptions): Plugin {
  validateAdminPermissions(options.permissions)
  const context = Object.freeze({ ...options, permissions: Object.freeze(resolveAdminPermissions(options.permissions)) })
  return { install(app) { app.provide(adminKey, context) } }
}
export function useRbacAdmin(): Readonly<ResolvedOptions> {
  const context = inject(adminKey)
  if (!context) throw new Error('Install createRbacAdminPlugin before mounting admin views')
  return context
}
