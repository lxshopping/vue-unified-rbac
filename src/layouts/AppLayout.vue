<script setup lang="ts">
import { computed } from 'vue'
import { RouterView } from 'vue-router'

import { staticMenus } from '@/config/menu'
import SidebarMenu from '@/layouts/SidebarMenu.vue'
import { filterMenus } from '@/rbac/menu'
import { useAccessStore } from '@/stores/access'

const accessStore = useAccessStore()

// 菜单结构固定，只按权限过滤；权限尚未加载时只显示公共入口。
const visibleMenus = computed(() =>
  filterMenus(staticMenus, accessStore.hasPermission),
)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <h1>Vue Unified RBAC</h1>
      <p class="muted">V1 · 静态菜单</p>

      <nav>
        <SidebarMenu :menus="visibleMenus" />
      </nav>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
