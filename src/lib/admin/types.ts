import type { RbacAdminApi } from './api/types'
export interface RbacAdminPermissions {
  roleView: string
  roleManage?: string
  roleCreate?: string
  roleUpdate?: string
  roleDelete?: string
  userRoleView?: string
  userRoleUpdate?: string
  meView: string
}
export interface RbacAdminOptions {
  api: RbacAdminApi
  permissions: RbacAdminPermissions
  /** Explicit opt-in for all writes; also requires the action permission and API capability. */
  editable?: boolean
}
export interface RbacAdminRouteOptions {
  permissions: RbacAdminPermissions
  basePath?: string
  namePrefix?: string
  permissionMetaKey?: string
}
