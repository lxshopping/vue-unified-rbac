import { PERMISSIONS } from './permission-codes'

export interface StaticMenuItem {
  title: string
  path: string
  permission?: string
}

/**
 * V1 静态菜单：菜单结构由前端代码固定。
 * permission 只决定“显示不显示”，不生成动态路由。
 */
export const staticMenus: StaticMenuItem[] = [
  { title: '首页', path: '/' },
  { title: '发布单', path: '/release/orders', permission: PERMISSIONS.RELEASE_ORDER_VIEW },
  { title: '角色管理', path: '/rbac/roles', permission: PERMISSIONS.RBAC_ROLE_VIEW },
  { title: '权限管理', path: '/rbac/permissions', permission: PERMISSIONS.RBAC_PERMISSION_VIEW },
  {
    title: '角色权限矩阵',
    path: '/rbac/role-permissions',
    permission: PERMISSIONS.RBAC_ROLE_PERMISSION_VIEW,
  },
  { title: '用户角色', path: '/rbac/user-roles', permission: PERMISSIONS.RBAC_USER_ROLE_VIEW },
  { title: '我的权限', path: '/rbac/me' },
]
