<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { staticMenus } from '@/config/menu'
import { useAccessStore } from '@/stores/access'

const accessStore = useAccessStore()

// 菜单结构固定，只按权限过滤；权限尚未加载时只显示公共入口。
const visibleMenus = computed(() =>
  staticMenus.filter((menu) => {
    if (!menu.permission) {
      return true
    }

    return accessStore.hasPermission(menu.permission)
  }),
)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h1>Vue Unified RBAC</h1>
      <p class="muted">V1 · 静态菜单</p>

      <nav>
        <RouterLink v-for="item in visibleMenus" :key="item.path" :to="item.path">
          {{ item.title }}
        </RouterLink>
      </nav>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
