import type { AccessResult } from '../../access/types'

export interface RbacRole {
  id?: string | number
  code: string
  name?: string
  active?: boolean
  description?: string
  permissionCount?: number
  protected?: boolean
}
export interface CreateRolePayload { code: string; name: string; description?: string; active?: boolean }
export interface UpdateRolePayload { name?: string; description?: string; active?: boolean }
export interface LocalRbacUser {
  id: string | number
  username: string
  active?: boolean
  roles: string[]
  authSource?: string
  roleSource?: string
}
export interface UpdateUserRolesPayload { roles: string[] }
export interface RbacPermission { code: string; name?: string; description?: string }
export interface RbacAdminApi {
  /** Explicit capability, false/absent means read-only. */
  readonly supportsUpdates?: boolean
  listRoles(): Promise<RbacRole[]>
  createRole?(data: CreateRolePayload): Promise<void>
  updateRole?(id: string | number, data: UpdateRolePayload): Promise<void>
  deleteRole?(id: string | number): Promise<void>
  listLocalUsers?(): Promise<LocalRbacUser[]>
  getLocalUserRoles?(id: string | number): Promise<string[]>
  updateLocalUserRoles?(id: string | number, roles: string[]): Promise<void>
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
  roleDetail?: (id: string | number) => string
  localUsers?: string
  localUserRoles?: (id: string | number) => string
  updateLocalUserRoles?: (id: string | number) => string
}
export interface RbacAdminApiOptions {
  /** Omit endpoints to use the DRF 0.3.2 contract. Existing explicit endpoints retain their capabilities. */
  endpoints?: RbacAdminEndpoints
  basePath?: string
  updateMethod?: 'put' | 'patch' | 'post'
  /** Adapt envelopes/pagination here. Return the complete catalogue for a matrix. */
  adapters?: {
    roles?: (data: unknown) => RbacRole[]
    permissions?: (data: unknown) => RbacPermission[]
    rolePermissions?: (data: unknown) => string[]
    me?: (data: unknown) => AccessResult
    updateBody?: (permissions: string[]) => unknown
    roleBody?: (data: CreateRolePayload | UpdateRolePayload) => unknown
    localUsers?: (data: unknown) => LocalRbacUser[]
    localUserRoles?: (data: unknown) => string[]
    userRolesBody?: (roles: string[]) => unknown
  }
}
