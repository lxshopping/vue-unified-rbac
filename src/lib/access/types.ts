export interface AccessResult {
  username?: string
  auth_source?: string
  /** Compatibility with hosts that already map auth_source to camelCase. */
  authSource?: string
  role_source?: string
  roleSource?: string
  roles: string[]
  permissions: string[]
}

export type AccessLoader = () => Promise<AccessResult>

/** Validate network data even when a host has asserted a TypeScript type. */
export function normalizeAccess(data: unknown): AccessResult {
  if (!data || typeof data !== 'object') throw new Error('加载权限失败：AccessResult 格式异常')
  const value = data as Record<string, unknown>
  const strings = (items: unknown): items is string[] =>
    Array.isArray(items) && Array.from(items).every((item) => typeof item === 'string')
  if (
    !strings(value.roles) || !strings(value.permissions) ||
    (value.username !== undefined && typeof value.username !== 'string') ||
    (value.auth_source !== undefined && typeof value.auth_source !== 'string') ||
    (value.authSource !== undefined && typeof value.authSource !== 'string') ||
    (value.role_source !== undefined && typeof value.role_source !== 'string') ||
    (value.roleSource !== undefined && typeof value.roleSource !== 'string')
  ) {
    throw new Error('加载权限失败：AccessResult 格式异常')
  }
  return {
    username: value.username,
    auth_source: value.auth_source,
    authSource: value.authSource,
    ...(value.role_source !== undefined || value.roleSource !== undefined
      ? { role_source: (value.role_source ?? value.roleSource) as string } : {}),
    roles: [...value.roles],
    permissions: [...value.permissions],
  }
}
