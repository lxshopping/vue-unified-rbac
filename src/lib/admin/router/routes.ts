import type { RouteRecordRaw } from 'vue-router'
import { resolveAdminPermissions } from '../context'
import type { RbacAdminRouteOptions } from '../types'

export function createRbacAdminRoutes(options: RbacAdminRouteOptions): RouteRecordRaw[] {
  const permissions = resolveAdminPermissions(options.permissions)
  const base = (options.basePath ?? '/rbac-admin').replace(/[/]+$/, '')
  if (!base.startsWith('/') && base !== '') throw new Error('Admin basePath must be absolute')
  const prefix = options.namePrefix ?? 'rbac-admin'
  const key = options.permissionMetaKey ?? 'permission'
  if (!key.trim() || key === 'rbacAdminTitle') throw new Error('permissionMetaKey must be non-empty and not rbacAdminTitle')
  return [
    { path: base + '/roles', name: prefix + '-roles', meta: { [key]: permissions.roleView, rbacAdminTitle: '角色列表' },
      component: () => import('../views/RoleListView') },
    { path: base + '/role-permissions', name: prefix + '-role-permissions', meta: { [key]: permissions.roleView, rbacAdminTitle: '角色权限矩阵' },
      component: () => import('../views/RolePermissionMatrixView') },
    { path: base + '/local-user-roles', name: prefix + '-local-user-roles', meta: { [key]: permissions.userRoleView, rbacAdminTitle: '本地用户角色' },
      component: () => import('../views/LocalUserRolesView') },
    { path: base + '/me', name: prefix + '-me', meta: { [key]: permissions.meView, rbacAdminTitle: '当前用户权限' },
      component: () => import('../views/MyAccessView') },
  ]
}
export function createRbacAdminMenu(options: RbacAdminRouteOptions) {
  return createRbacAdminRoutes(options).map(route => ({
    title: route.meta!.rbacAdminTitle as string, path: route.path,
    permission: route.meta![options.permissionMetaKey ?? 'permission'] as string,
  }))
}
