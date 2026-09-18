import { defineAsyncComponent } from 'vue'
export { createRbacAdminApi } from './api/client'
export type { RbacRole, RbacPermission, RbacAdminApi, RbacAdminEndpoints, RbacAdminApiOptions } from './api/types'
export { createRbacAdminPlugin, useRbacAdmin } from './context'
export { createRbacAdminRoutes, createRbacAdminMenu } from './router/routes'
export type { RbacAdminOptions, RbacAdminPermissions, RbacAdminRouteOptions } from './types'
export const RoleListView = /* @__PURE__ */ defineAsyncComponent(() => import('./views/RoleListView'))
export const RolePermissionMatrixView = /* @__PURE__ */ defineAsyncComponent(() => import('./views/RolePermissionMatrixView'))
export const MyAccessView = /* @__PURE__ */ defineAsyncComponent(() => import('./views/MyAccessView'))
