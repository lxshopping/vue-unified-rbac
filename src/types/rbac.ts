/**
 * 后端 /api/rbac/me 的前端数据模型。
 *
 * 注意：
 * - 前端只消费 role codes / permission codes。
 * - Role -> Permission 的计算必须在后端完成。
 * - 前端不根据 role 自己推导 permission。
 */
export interface RbacMe {
  username: string
  authSource: 'local' | 'sso'
  roles: string[]
  permissions: string[]
}

export interface RoleItem {
  code: string
  name: string
  enabled: boolean
  source?: 'local' | 'sso'
}

export interface PermissionItem {
  code: string
  name: string
  enabled: boolean
  description?: string
}
