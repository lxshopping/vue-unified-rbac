<script setup lang="ts">
import { RouterLink } from 'vue-router'

import type { StaticMenuItem } from '@/config/menu'

defineProps<{ menus: StaticMenuItem[] }>()
</script>

<template>
  <div class="menu-list">
    <div v-for="item in menus" :key="item.path ?? item.title" class="menu-item">
      <RouterLink v-if="item.path" :to="item.path">{{ item.title }}</RouterLink>
      <span v-else class="menu-title">{{ item.title }}</span>
      <SidebarMenu v-if="item.children?.length" :menus="item.children" />
    </div>
  </div>
</template>

<style scoped>
.menu-list,
.menu-item {
  display: grid;
  gap: 8px;
}

.menu-list .menu-list {
  padding-left: 12px;
}

.menu-title {
  padding: 9px 10px;
}
</style>
