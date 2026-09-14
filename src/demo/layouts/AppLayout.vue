<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterView } from 'vue-router'

import { staticMenus } from '@/config/menu'
import SidebarMenu from '@/layouts/SidebarMenu.vue'
import { filterMenus } from '@scotec/vue-unified-rbac'
import { useAccessStore } from '@scotec/vue-unified-rbac'
import { authenticationError, login, logout } from '@/auth/keycloak'

const accessStore = useAccessStore()
const logoutPending = ref(false)
const logoutError = ref<string | null>(null)

async function handleLogout() {
  logoutPending.value = true
  logoutError.value = null
  accessStore.clearAccess()
  try {
    await logout()
  } catch {
    logoutPending.value = false
    logoutError.value = '退出登录失败，请检查 SSO 连接后重试。'
  }
}

async function handleLogin() {
  try {
    await login()
  } catch {
    // 认证模块提供可展示的错误，不向 Console 输出可能包含 Token 的请求对象。
  }
}

async function reloadAccess() {
  try {
    await accessStore.loadMyAccess()
  } catch {
    // 错误由 Store / 认证模块展示；只在用户明确点击时重新请求。
  }
}

// 菜单结构固定，只按权限过滤；权限尚未加载时只显示公共入口。
const visibleMenus = computed(() =>
  filterMenus(staticMenus, accessStore.hasPermission),
)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h1>Vue Unified RBAC</h1>
      <p class="muted">V1 · SSO · 静态菜单</p>

      <nav>
        <SidebarMenu :menus="visibleMenus" />
      </nav>
      <div class="actions">
        <button :disabled="logoutPending" @click="handleLogout">
          {{ logoutPending ? '正在退出…' : 'Logout' }}
        </button>
      </div>
      <p v-if="logoutError" role="alert">{{ logoutError }}</p>
    </aside>

    <main class="content">
      <section v-if="authenticationError" role="alert">
        <h2>登录状态异常</h2>
        <p>{{ authenticationError }}</p>
        <button @click="handleLogin">重新登录</button>
      </section>
      <section v-else-if="accessStore.error" role="alert">
        <h2>权限加载失败</h2>
        <p>{{ accessStore.error }}</p>
        <button :disabled="accessStore.loading" @click="reloadAccess">重新加载权限</button>
      </section>
      <RouterView v-else />
    </main>
  </div>
</template>
