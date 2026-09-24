import type { AxiosInstance } from 'axios'
import { normalizeAccess } from '../../access/types'
import type { RbacAdminApi, RbacAdminApiOptions, RbacAdminEndpoints, RbacPermission, RbacRole, LocalRbacUser, CreateRolePayload, UpdateRolePayload } from './types'

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid admin response')
  return value as Record<string, unknown>
}
function codes(value: unknown): string[] {
  if (!Array.isArray(value) || !Array.from(value).every(v => typeof v === 'string' && v.trim())) throw new Error('Invalid permission or role codes')
  if (new Set(value).size !== value.length) throw new Error('Duplicate permission or role codes')
  return [...value]
}
function codeSet(data: unknown, key: string, alias: string): string[] {
  return codes(Array.isArray(data) ? data : object(data)[key] ?? object(data)[alias])
}
function catalogue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Invalid admin catalogue')
  const rows = value.map(object)
  if (!rows.every(v => typeof v.code === 'string' && v.code.trim() &&
    (v.name === undefined || typeof v.name === 'string') &&
    (v.description === undefined || typeof v.description === 'string'))) throw new Error('Invalid admin catalogue')
  if (new Set(rows.map(v => v.code)).size !== rows.length) throw new Error('Duplicate catalogue codes')
  return rows
}
function active(value: unknown): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') throw new Error('Invalid role/user metadata')
  return value
}
function identifier(value: unknown): value is string | number {
  return (typeof value === 'string' && value.length > 0) || (typeof value === 'number' && Number.isFinite(value))
}
function role(value: Record<string, unknown>): RbacRole {
  const permissionCount = value.permissionCount ?? value.permission_count
  if ((value.id !== undefined && !identifier(value.id)) ||
      (permissionCount !== undefined && (!Number.isInteger(permissionCount) || (permissionCount as number) < 0))) throw new Error('Invalid role metadata')
  return { ...value, active: active(value.active ?? value.enabled ?? value.is_active),
    permissionCount, protected: active(value.protected ?? value.is_protected) } as RbacRole
}
function user(value: unknown): LocalRbacUser {
  const v = object(value)
  if (!identifier(v.id) || typeof v.username !== 'string') throw new Error('Invalid local user')
  const authSource = v.authSource ?? v.auth_source
  const roleSource = v.roleSource ?? v.role_source
  if ((authSource !== undefined && typeof authSource !== 'string') ||
      (roleSource !== undefined && typeof roleSource !== 'string')) throw new Error('Invalid user source')
  return { id: v.id, username: v.username, active: active(v.active ?? v.is_active),
    roles: codes(v.roles), authSource, roleSource }
}
export function createRbacAdminApi(instance: AxiosInstance, options: RbacAdminApiOptions = {}): RbacAdminApi {
  const a = options.adapters ?? {}
  const base = (options.basePath ?? '/api/rbac/admin').replace(/\/+$/, '')
  const roleIds = new Map<string, string | number>()
  const detail = (id: string | number) => base + '/roles/' + encodeURIComponent(String(id)) + '/'
  const rolePermissions = (code: string) => {
    const id = roleIds.get(code)
    if (id === undefined) throw new Error('Load the role catalogue before requesting role permissions')
    return detail(id) + 'permissions/'
  }
  const userRoles = (id: string | number) => base + '/users/' + encodeURIComponent(String(id)) + '/roles/'
  const e: RbacAdminEndpoints = options.endpoints ?? {
    roles: base + '/roles/', permissions: base + '/permissions/', roleDetail: detail,
    rolePermissions, updateRolePermissions: rolePermissions,
    localUsers: base + '/users/', localUserRoles: userRoles, updateLocalUserRoles: userRoles,
  }
  function endpoint(url: string | undefined): string {
    if (typeof url !== 'string' || !url.trim()) throw new Error('Admin endpoint must be configured')
    return url
  }
  // Request every DRF page using the configured URL, never a server-provided host.
  async function list(url: string | undefined, adapter?: (data: unknown) => unknown): Promise<unknown> {
    const target = endpoint(url)
    let data: unknown = (await instance.get(target)).data
    if (adapter) return adapter(data)
    if (Array.isArray(data)) return data
    const rows: unknown[] = []
    const seen = new Set<string>()
    while (true) {
      const page = object(data)
      if (!Array.isArray(page.results)) throw new Error('Invalid admin pagination')
      rows.push(...page.results)
      if (page.next === null || page.next === undefined) return rows
      if (typeof page.next !== 'string') throw new Error('Invalid next page')
      const next = new URL(page.next, 'http://pagination.invalid').searchParams.get('page')
      if (!next || !/^\d+$/.test(next) || seen.has(next)) throw new Error('Invalid or repeated next page')
      seen.add(next)
      data = (await instance.get(target, { params: { page: next } })).data
    }
  }
  function roleBody(data: CreateRolePayload | UpdateRolePayload) {
    if (a.roleBody) return a.roleBody(data)
    return { ...('code' in data ? { code: data.code } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.active !== undefined ? { enabled: data.active } : {}) }
  }
  return {
    supportsUpdates: typeof e.updateRolePermissions === 'function',
    async listRoles() {
      const roles = catalogue(await list(e.roles, a.roles)).map(role)
      roleIds.clear()
      for (const entry of roles) if (entry.id !== undefined) roleIds.set(entry.code, entry.id)
      return roles
    },
    ...(e.roleDetail ? {
      async createRole(data: CreateRolePayload) { await instance.post(endpoint(e.roles), roleBody(data)) },
      async updateRole(id: string | number, data: UpdateRolePayload) { await instance.patch(endpoint(e.roleDetail!(id)), roleBody(data)) },
      async deleteRole(id: string | number) { await instance.delete(endpoint(e.roleDetail!(id))) },
    } : {}),
    async listPermissions() { return catalogue(await list(e.permissions, a.permissions)).map(v => ({ ...v }) as unknown as RbacPermission) },
    async getRolePermissions(code) {
      const data: unknown = (await instance.get(endpoint(e.rolePermissions(code)))).data
      return a.rolePermissions ? codes(a.rolePermissions(data)) : codeSet(data, 'permission_codes', 'permissions')
    },
    async updateRolePermissions(code, permissions) {
      if (!e.updateRolePermissions) throw new Error('Admin API is read-only')
      const validated = codes(permissions)
      await instance.request({ url: endpoint(e.updateRolePermissions(code)), method: options.updateMethod ?? 'put',
        data: a.updateBody ? a.updateBody(validated) : { permissions: validated } })
    },
    ...(e.localUsers ? { async listLocalUsers() {
      const data = await list(e.localUsers, a.localUsers)
      if (!Array.isArray(data)) throw new Error('Invalid local users')
      const users = data.map(user)
      if (new Set(users.map(v => String(v.id))).size !== users.length) throw new Error('Duplicate local users')
      return users
    } } : {}),
    ...(e.localUserRoles ? { async getLocalUserRoles(id: string | number) {
      const data: unknown = (await instance.get(endpoint(e.localUserRoles!(id)))).data
      return a.localUserRoles ? codes(a.localUserRoles(data)) : codeSet(data, 'role_codes', 'roles')
    } } : {}),
    ...(e.updateLocalUserRoles ? { async updateLocalUserRoles(id: string | number, roles: string[]) {
      const validated = codes(roles)
      await instance.put(endpoint(e.updateLocalUserRoles!(id)), a.userRolesBody ? a.userRolesBody(validated) : { roles: validated })
    } } : {}),
    async getMyAccess() {
      const data: unknown = (await instance.get(endpoint(e.me ?? '/api/rbac/me'))).data
      return normalizeAccess(a.me ? a.me(data) : data)
    },
  }
}
