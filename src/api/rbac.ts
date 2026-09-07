import type { RbacMe } from '@/types/rbac'

/**
 * PSEUDOCODE ONLY
 *
 * fetchMyAccess():
 *   1. 从现有 auth 模块取得 Keycloak access token
 *   2. GET /api/rbac/me
 *   3. Header: Authorization: Bearer <token>
 *   4. HTTP 200 -> 返回 username/authSource/roles/permissions
 *   5. HTTP 401 -> 交给 auth 模块重新登录
 *   6. 其他错误 -> 抛出错误，不要默认授予权限
 *
 * 当前故意不实现 HTTP Client，下一阶段由你/Codex 完成。
 */
export async function fetchMyAccess(): Promise<RbacMe> {
  throw new Error('TODO: implement GET /api/rbac/me')
}
