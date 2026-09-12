<script setup lang="ts">
import { PERMISSIONS } from '@/config/permission-codes'

const permissionExamples = [
  PERMISSIONS.DEMO_ORDER_VIEW,
  PERMISSIONS.DEMO_ORDER_CREATE,
  PERMISSIONS.DEMO_ORDER_APPROVE,
  PERMISSIONS.DEMO_ORDER_DELETE,
]
</script>

<template>
  <section>
    <h2>订单 Demo</h2>
    <p>本页由查看权限控制访问；以下按钮仅演示权限控制，暂未接入业务接口。</p>
    <p class="muted">后端仍需独立校验每个业务请求的权限。</p>

    <h3>页面与按钮权限</h3>
    <ul>
      <li v-for="code in permissionExamples" :key="code"><code>{{ code }}</code></li>
    </ul>

    <div class="actions">
      <button v-permission="PERMISSIONS.DEMO_ORDER_CREATE" disabled>
        创建订单
      </button>
      <button v-permission="PERMISSIONS.DEMO_ORDER_APPROVE" disabled>
        审批
      </button>
      <button v-permission="PERMISSIONS.DEMO_ORDER_DELETE" disabled>
        删除
      </button>
    </div>
  </section>
</template>
