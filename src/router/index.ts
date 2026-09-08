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
import { useAccessStore } from '@/stores/access'

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

router.beforeEach(async (to) => {
  // 错误页不请求权限，避免失败后再次拦截或循环跳转。
  if (to.path === '/403') {
    return true
  }

  const accessStore = useAccessStore()

  if (!accessStore.loaded) {
    try {
      await accessStore.loadMyAccess()
    } catch {
      // Store 已清空权限并记录错误，继续按 default deny 判断页面。
    }
  }

  const required = to.meta.permission
  if (!required) {
    return true
  }

  if (accessStore.hasPermission(required)) {
    return true
  }

  return '/403'
})

export default router
