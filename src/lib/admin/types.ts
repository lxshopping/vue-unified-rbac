import type { RbacAdminApi } from './api/types'
export interface RbacAdminPermissions {
  roleView: string
  roleManage: string
  meView: string
}
export interface RbacAdminOptions {
  api: RbacAdminApi
  permissions: RbacAdminPermissions
  /** Must also have roleManage and an API with supportsUpdates=true. */
  editable?: boolean
}
export interface RbacAdminRouteOptions {
  permissions: RbacAdminPermissions
  basePath?: string
  namePrefix?: string
  permissionMetaKey?: string
}
