<script setup lang="ts">
import { PERMISSIONS } from '@/config/permission-codes'
import { useAccessStore } from '@/stores/access'

const accessStore = useAccessStore()

const permissionExamples = [
  PERMISSIONS.RELEASE_ORDER_VIEW,
  PERMISSIONS.RELEASE_ORDER_CREATE,
  PERMISSIONS.RELEASE_ORDER_APPROVE,
  PERMISSIONS.RELEASE_ORDER_DEPLOY,
]
</script>

<template>
  <section>
    <h2>发布单</h2>
    <p>本页仅演示权限控制按钮显示，暂未接入创建、审批和发布接口。</p>
    <p class="muted">后端仍需独立校验每个业务请求的权限。</p>

    <h3>页面与按钮权限</h3>
    <ul>
      <li v-for="code in permissionExamples" :key="code"><code>{{ code }}</code></li>
    </ul>

    <div class="actions">
      <button v-if="accessStore.hasPermission(PERMISSIONS.RELEASE_ORDER_CREATE)" disabled>
        创建发布单
      </button>
      <button v-if="accessStore.hasPermission(PERMISSIONS.RELEASE_ORDER_APPROVE)" disabled>
        审批
      </button>
      <button v-if="accessStore.hasPermission(PERMISSIONS.RELEASE_ORDER_DEPLOY)" disabled>
        执行发布
      </button>
    </div>
  </section>
</template>
