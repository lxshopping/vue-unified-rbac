<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

import { staticMenus } from '@/config/menu'

/**
 * PSEUDOCODE:
 *
 * visibleMenus = staticMenus.filter(menu => {
 *   if menu.permission is empty:
 *       return true
 *   return accessStore.hasPermission(menu.permission)
 * })
 *
 * 当前为了先看静态页面结构，暂时全部显示。
 */
const visibleMenus = computed(() => staticMenus)
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
