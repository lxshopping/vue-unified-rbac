import type { AccessResult } from '../../access/types'

export interface RbacRole {
  code: string
  name?: string
  active?: boolean
  description?: string
  permissionCount?: number
}
export interface RbacPermission { code: string; name?: string; description?: string }
export interface RbacAdminApi {
  /** Explicit capability, false/absent means read-only. */
  readonly supportsUpdates?: boolean
  listRoles(): Promise<RbacRole[]>
  listPermissions(): Promise<RbacPermission[]>
  getRolePermissions(role: string): Promise<string[]>
  updateRolePermissions(role: string, permissions: string[]): Promise<void>
  getMyAccess(): Promise<AccessResult>
}
export interface RbacAdminEndpoints {
  roles: string
  permissions: string
  rolePermissions: (role: string) => string
  updateRolePermissions?: (role: string) => string
  me?: string
}
export interface RbacAdminApiOptions {
  endpoints: RbacAdminEndpoints
  updateMethod?: 'put' | 'patch' | 'post'
  /** Adapt envelopes/pagination here. Return the complete catalogue for a matrix. */
  adapters?: {
    roles?: (data: unknown) => RbacRole[]
    permissions?: (data: unknown) => RbacPermission[]
    rolePermissions?: (data: unknown) => string[]
    me?: (data: unknown) => AccessResult
    updateBody?: (permissions: string[]) => unknown
  }
}
