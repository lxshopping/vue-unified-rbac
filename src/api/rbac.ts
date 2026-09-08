import type { RbacMe } from '@/types/rbac'

// 学习阶段临时从 sessionStorage 取 Token，接入登录后只需替换这里。
function getAccessToken(): string | null {
  return sessionStorage.getItem('access_token')
}

export async function fetchMyAccess(): Promise<RbacMe> {
  const token = getAccessToken()
  const response = await fetch('/api/rbac/me', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })

  if (!response.ok) {
    throw new Error(`加载权限失败（HTTP ${response.status}）`)
  }

  const data = await response.json()

  // TypeScript 类型不能校验网络数据；结构异常时拒绝整份响应，避免误授予权限。
  if (
    !data ||
    typeof data !== 'object' ||
    typeof data.username !== 'string' ||
    (data.auth_source !== 'local' && data.auth_source !== 'sso') ||
    !Array.isArray(data.roles) ||
    !data.roles.every((role: unknown) => typeof role === 'string') ||
    !Array.isArray(data.permissions) ||
    !data.permissions.every((code: unknown) => typeof code === 'string')
  ) {
    throw new Error('加载权限失败：/api/rbac/me 响应格式异常')
  }

  return {
    username: data.username,
    authSource: data.auth_source,
    roles: data.roles,
    permissions: data.permissions,
  }
}
