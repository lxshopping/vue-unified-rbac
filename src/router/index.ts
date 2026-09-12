import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/layouts/AppLayout.vue'
import HomeView from '@/views/HomeView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import ReleaseOrderView from '@/views/release/ReleaseOrderView.vue'
import MyPermissionView from '@/views/rbac/MyPermissionView.vue'
import { PERMISSIONS } from '@/config/permission-codes'
import { useAccessStore } from '@/stores/access'
import { authenticationError, isAuthenticated, recoverAuthentication } from '@/auth/keycloak'

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
          meta: { title: '订单 Demo', permission: PERMISSIONS.DEMO_ORDER_VIEW },
        },
        // RBAC 管理页面源码保留，待第二阶段接口就绪后恢复路由。
        { path: 'rbac/me', component: MyPermissionView, meta: { title: '我的权限' } },
        { path: '403', component: ForbiddenView, meta: { title: '403' } },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  // 所有未声明 permission 的页面都跳过 RBAC guard，包括首页与 /403。
  if (!('permission' in to.meta)) {
    return true
  }

  if (!isAuthenticated() || authenticationError.value) {
    try {
      await recoverAuthentication()
    } catch {
      // 自动重登被阻止时，回公共首页显示认证错误，不能误报 /403。
    }
    return { path: '/', replace: true }
  }

  const accessStore = useAccessStore()

  if (!accessStore.loaded) {
    try {
      await accessStore.loadMyAccess()
    } catch {
      return { path: '/', replace: true }
    }
  }

  // 只有权限成功加载之后，才把缺少权限认定为 403。
  if (authenticationError.value || accessStore.error || !accessStore.me) {
    return { path: '/', replace: true }
  }

  const required = to.meta.permission
  if (accessStore.hasPermission(required ?? '')) {
    return true
  }

  return '/403'
})

export default router
