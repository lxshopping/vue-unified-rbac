import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/layouts/AppLayout.vue'
import HomeView from '@/views/HomeView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import ReleaseOrderView from '@/views/release/ReleaseOrderView.vue'
import RoleListView from '@/views/rbac/RoleListView.vue'
import PermissionListView from '@/views/rbac/PermissionListView.vue'
import RolePermissionMatrixView from '@/views/rbac/RolePermissionMatrixView.vue'
import UserRoleView from '@/views/rbac/UserRoleView.vue'
import MyPermissionView from '@/views/rbac/MyPermissionView.vue'
import { PERMISSIONS } from '@/config/permission-codes'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppLayout,
      children: [
        { path: '', component: HomeView, meta: { title: '首页' } },
        {
          path: 'release/orders',
          component: ReleaseOrderView,
          meta: { title: '发布单', permission: PERMISSIONS.RELEASE_ORDER_VIEW },
        },
        {
          path: 'rbac/roles',
          component: RoleListView,
          meta: { title: '角色管理', permission: PERMISSIONS.RBAC_ROLE_VIEW },
        },
        {
          path: 'rbac/permissions',
          component: PermissionListView,
          meta: { title: '权限管理', permission: PERMISSIONS.RBAC_PERMISSION_VIEW },
        },
        {
          path: 'rbac/role-permissions',
          component: RolePermissionMatrixView,
          meta: {
            title: '角色权限矩阵',
            permission: PERMISSIONS.RBAC_ROLE_PERMISSION_VIEW,
          },
        },
        {
          path: 'rbac/user-roles',
          component: UserRoleView,
          meta: { title: '用户角色', permission: PERMISSIONS.RBAC_USER_ROLE_VIEW },
        },
        { path: 'rbac/me', component: MyPermissionView, meta: { title: '我的权限' } },
        { path: '403', component: ForbiddenView, meta: { title: '403' } },
      ],
    },
  ],
})

/**
 * PSEUDOCODE - 下一阶段再打开路由权限守卫：
 *
 * router.beforeEach(async (to) => {
 *   access = useAccessStore()
 *
 *   if not access.loaded:
 *       await access.loadMyAccess()
 *
 *   required = to.meta.permission
 *   if required is empty:
 *       allow
 *
 *   if access.hasPermission(required):
 *       allow
 *
 *   return /403
 * })
 *
 * 注意：这里仍然只是 UI 导航限制，真正安全边界在 DRF RBACPermission。
 */

export default router
