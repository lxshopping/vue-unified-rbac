/**
 * V1 先集中维护前端会引用到的 permission code，避免页面到处散落字符串。
 * 后端 Permission.code 仍然是真实权限来源，前后端必须保持同名。
 */
export const PERMISSIONS = {
  DEMO_ORDER_VIEW: 'demo.order.view',
  DEMO_ORDER_CREATE: 'demo.order.create',
  DEMO_ORDER_APPROVE: 'demo.order.approve',
  DEMO_ORDER_DELETE: 'demo.order.delete',
} as const
