import type { AxiosInstance } from 'axios'
import { normalizeAccess } from '../../access/types'
import type { RbacAdminApi, RbacAdminApiOptions, RbacPermission, RbacRole } from './types'

function codes(value: unknown): string[] {
  if (!Array.isArray(value) || !Array.from(value).every(v => typeof v === 'string' && v.trim())) {
    throw new Error('Invalid permission codes')
  }
  if (new Set(value).size !== value.length) throw new Error('Duplicate permission codes')
  return [...value]
}
function catalogue(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || !Array.from(value).every(v => v && typeof v === 'object' &&
      typeof v.code === 'string' && v.code.trim() &&
      (v.name === undefined || typeof v.name === 'string') &&
      (v.description === undefined || typeof v.description === 'string'))) throw new Error('Invalid admin catalogue')
  if (new Set(value.map(v => v.code)).size !== value.length) throw new Error('Duplicate catalogue codes')
  return value
}
export function createRbacAdminApi(instance: AxiosInstance, options: RbacAdminApiOptions): RbacAdminApi {
  const { endpoints: e, adapters: a = {} } = options
  function endpoint(url: string | undefined): string {
    if (typeof url !== 'string' || !url.trim()) throw new Error('Admin endpoint must be configured')
    return url
  }
  return {
    supportsUpdates: typeof e.updateRolePermissions === 'function',
    async listRoles() {
      const data: unknown = (await instance.get(endpoint(e.roles))).data
      return catalogue(a.roles ? a.roles(data) : data).map(v => {
        if ((v.active !== undefined && typeof v.active !== 'boolean') ||
            (v.permissionCount !== undefined && (!Number.isInteger(v.permissionCount) || (v.permissionCount as number) < 0))) {
          throw new Error('Invalid role metadata')
        }
        return { ...v } as unknown as RbacRole
      })
    },
    async listPermissions() {
      const data: unknown = (await instance.get(endpoint(e.permissions))).data
      return catalogue(a.permissions ? a.permissions(data) : data).map(v => ({ ...v }) as unknown as RbacPermission)
    },
    async getRolePermissions(role) {
      const data: unknown = (await instance.get(endpoint(e.rolePermissions(role)))).data
      return codes(a.rolePermissions ? a.rolePermissions(data) : data)
    },
    async updateRolePermissions(role, permissions) {
      if (!e.updateRolePermissions) throw new Error('Admin API is read-only')
      const validated = codes(permissions)
      await instance.request({ url: endpoint(e.updateRolePermissions(role)), method: options.updateMethod ?? 'put',
        data: a.updateBody ? a.updateBody(validated) : { permissions: validated } })
    },
    async getMyAccess() {
      const data: unknown = (await instance.get(endpoint(e.me ?? '/api/rbac/me'))).data
      return normalizeAccess(a.me ? a.me(data) : data)
    },
  }
}
