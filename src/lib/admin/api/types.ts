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
export interface UpdateUserRolesPayload { role_codes: string[] }
export interface RbacPermission { id?: string | number; code: string; name?: string; description?: string }
export interface RbacAdminApi {
  listAuditLogs?(query?: AuditLogQuery): Promise<AuditLogPage>
  getAuditLog?(id: string | number): Promise<AuditLog>
  /** Deprecated matrix-only capability hint. False disables matrix writes; never gates other actions. */
  readonly supportsUpdates?: boolean
  getRole?(id: string | number): Promise<RbacRole>
  getPermission?(id: string | number): Promise<RbacPermission>
  listRoles(): Promise<RbacRole[]>
  createRole?(data: CreateRolePayload): Promise<void>
  updateRole?(id: string | number, data: UpdateRolePayload): Promise<void>
  deleteRole?(id: string | number): Promise<void>
  listLocalUsers?(): Promise<LocalRbacUser[]>
  getLocalUserRoles?(id: string | number): Promise<string[]>
  updateLocalUserRoles?(id: string | number, roles: string[]): Promise<void>
  listPermissions(): Promise<RbacPermission[]>
  getRolePermissions(role: string): Promise<string[]>
  updateRolePermissions?(role: string, permissions: string[]): Promise<void>
  getMyAccess(): Promise<AccessResult>
}
export interface RbacAdminEndpoints {
  auditLogs?: string | null
  auditLogDetail?: ((id: string | number) => string) | null
  roles: string
  permissions: string
  rolePermissions: (role: string) => string
  updateRolePermissions?: ((role: string) => string) | null
  permissionDetail?: ((id: string | number) => string) | null
  me?: string
  roleDetail?: ((id: string | number) => string) | null
  localUsers?: string | null
  localUserRoles?: ((id: string | number) => string) | null
  updateLocalUserRoles?: ((id: string | number) => string) | null
}
export interface RbacAdminApiOptions {
  /** Partial overrides merge with DRF 0.3.3 defaults. Null explicitly disables an optional capability; undefined inherits. */
  endpoints?: Partial<RbacAdminEndpoints>
  basePath?: string
  roleUpdateMethod?: 'patch' | 'put'
  updateMethod?: 'put' | 'patch' | 'post'
  /** Adapt envelopes/pagination here. Return the complete catalogue for a matrix. */
  adapters?: {
    auditLogs?: (data: unknown) => AuditLogPage
    auditLog?: (data: unknown) => AuditLog
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

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export interface AuditLog {
  id: number
  actor_type: string
  actor_id: string
  actor_name: string
  action: string
  target_type: string
  target_id: string
  target_name: string
  before_data: { [key: string]: JsonValue }
  after_data: { [key: string]: JsonValue }
  created_at: string
  request_id: string
  result: 'success' | 'denied' | 'failed'
  reason_code: string
}
export interface AuditLogPage { count: number; next: string | null; previous: string | null; results: AuditLog[] }
export interface AuditLogQuery {
  page?: number
  page_size?: number
  actor_type?: string
  actor_id?: string
  actor_name?: string
  action?: string
  target_type?: string
  target_id?: string
  result?: 'success' | 'denied' | 'failed'
  request_id?: string
  created_after?: string
  created_before?: string
}
