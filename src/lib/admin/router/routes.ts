import type { RouteRecordRaw } from 'vue-router'
import { validateAdminPermissions } from '../context'
import type { RbacAdminRouteOptions } from '../types'

export function createRbacAdminRoutes(options: RbacAdminRouteOptions): RouteRecordRaw[] {
  validateAdminPermissions(options.permissions)
  const base = (options.basePath ?? '/rbac-admin').replace(/[/]+$/, '')
  if (!base.startsWith('/') && base !== '') throw new Error('Admin basePath must be absolute')
  const prefix = options.namePrefix ?? 'rbac-admin'
  const key = options.permissionMetaKey ?? 'permission'
  if (!key.trim()) throw new Error('permissionMetaKey must not be empty')
  return [
    { path: base + '/roles', name: prefix + '-roles', meta: { [key]: options.permissions.roleView },
      component: () => import('../views/RoleListView') },
    { path: base + '/role-permissions', name: prefix + '-role-permissions', meta: { [key]: options.permissions.roleView },
      component: () => import('../views/RolePermissionMatrixView') },
    { path: base + '/me', name: prefix + '-me', meta: { [key]: options.permissions.meView },
      component: () => import('../views/MyAccessView') },
  ]
}
export function createRbacAdminMenu(options: RbacAdminRouteOptions) {
  return createRbacAdminRoutes(options).map((route, index) => ({
    title: ['角色列表', '角色权限矩阵', '当前用户权限'][index], path: route.path,
    permission: route.meta![options.permissionMetaKey ?? 'permission'] as string,
  }))
}
