/**
 * V1 先集中维护前端会引用到的 permission code，避免页面到处散落字符串。
 * 后端 Permission.code 仍然是真实权限来源，前后端必须保持同名。
 */
// export const PERMISSIONS = {
//   RBAC_ROLE_VIEW: 'rbac.role.view',
//   RBAC_PERMISSION_VIEW: 'rbac.permission.view',
//   RBAC_ROLE_PERMISSION_VIEW: 'rbac.role_permission.view',
//   RBAC_ROLE_PERMISSION_UPDATE: 'rbac.role_permission.update',
//   RBAC_USER_ROLE_VIEW: 'rbac.user_role.view',

//   RELEASE_ORDER_VIEW: 'release.order.view',
//   RELEASE_ORDER_CREATE: 'release.order.create',
//   RELEASE_ORDER_APPROVE: 'release.order.approve',
//   RELEASE_ORDER_DEPLOY: 'release.order.deploy',
// } as const


export const PERMISSIONS = {
  DEMO_ORDER_VIEW: 'demo.order.view',
  DEMO_ORDER_CREATE: 'demo.order.create',
  DEMO_ORDER_APPROVE: 'demo.order.approve',
  DEMO_ORDER_DELETE: 'demo.order.delete',
} as const