<script setup lang="ts">
import { onMounted } from 'vue'

import { useAccessStore } from '@scotec/vue-unified-rbac'

const accessStore = useAccessStore()

onMounted(async () => {
  if (!accessStore.loaded) {
    try {
      await accessStore.loadMyAccess()
    } catch {
      // 错误由 Store 保存，模板显示真实失败状态。
    }
  }
})
</script>

<template>
  <section>
    <h2>我的权限</h2>
    <p v-if="!accessStore.loaded">正在加载权限…</p>
    <p v-else-if="accessStore.error" role="alert">加载失败：{{ accessStore.error }}</p>
    <template v-else-if="accessStore.me">
      <p>用户名（username）：{{ accessStore.me.username }}</p>
      <p>认证来源（auth_source）：{{ accessStore.authSource }}</p>

      <h3>角色（roles，仅展示）</h3>
      <ul v-if="accessStore.me.roles.length">
        <li v-for="role in accessStore.me.roles" :key="role">{{ role }}</li>
      </ul>
      <p v-else>无角色</p>

      <h3>权限（permissions）</h3>
      <ul v-if="accessStore.me.permissions.length">
        <li v-for="code in accessStore.me.permissions" :key="code"><code>{{ code }}</code></li>
      </ul>
      <p v-else>无权限</p>
    </template>
    <p v-else>尚无用户权限数据。</p>
  </section>
</template>
