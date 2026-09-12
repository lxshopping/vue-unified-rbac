import { PERMISSIONS } from './permission-codes'

export interface StaticMenuItem {
  title: string
  path?: string
  permission?: string
  children?: StaticMenuItem[]
}

/**
 * V1 静态菜单：菜单结构由前端代码固定。
 * permission 只决定“显示不显示”，不生成动态路由。
 */
export const staticMenus: StaticMenuItem[] = [
  { title: '首页', path: '/' },
  { title: '订单 Demo', path: '/release/orders', permission: PERMISSIONS.DEMO_ORDER_VIEW },
  // RBAC 管理菜单待第二阶段接口就绪后恢复。
  { title: '我的权限', path: '/rbac/me' },
]
