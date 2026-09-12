import { createRouter, createWebHistory } from 'vue-router'

import AppLayout from '@/layouts/AppLayout.vue'
import HomeView from '@/views/HomeView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import ReleaseOrderView from '@/views/release/ReleaseOrderView.vue'
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
  // 未声明权限才是公共路由；空字符串等非法配置仍交给核心默认拒绝。
  if (!('permission' in to.meta)) {
    return true
  }

  if (accessStore.hasPermission(required ?? '')) {
    return true
  }

  return '/403'
})

export default router
