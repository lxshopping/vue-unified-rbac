import type { RbacAdminApi } from './api/types'
export interface RbacAdminPermissions {
  auditView?: string
  roleView?: string
  roleCreate?: string
  roleUpdate?: string
  roleDelete?: string
  userRoleView?: string
  userRoleUpdate?: string
  rolePermissionView?: string
  rolePermissionUpdate?: string
  permissionView?: string
}
export interface RbacAdminOptions {
  api: RbacAdminApi
  permissions: RbacAdminPermissions
  /** Explicit opt-in for all writes; also requires the action permission and API capability. */
  editable?: boolean
}
export interface RbacAdminRouteOptions {
  /** Opt in to the 0.3.4 audit route and menu. Existing routes remain unchanged. */
  includeAudit?: boolean
  permissions: RbacAdminPermissions
  basePath?: string
  namePrefix?: string
  permissionMetaKey?: string
}
