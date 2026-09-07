<script setup lang="ts">
import { PERMISSIONS } from '@/config/permission-codes'

/**
 * PSEUDOCODE:
 *
 * canCreate  = access.hasPermission(RELEASE_ORDER_CREATE)
 * canApprove = access.hasPermission(RELEASE_ORDER_APPROVE)
 * canDeploy  = access.hasPermission(RELEASE_ORDER_DEPLOY)
 *
 * template:
 *   if canCreate  -> show 创建发布单
 *   if canApprove -> show 审批
 *   if canDeploy  -> show 发布
 *
 * 注意：按钮隐藏只是体验控制。
 * API POST approve/deploy 仍必须由 DRF RBACPermission 再校验。
 */
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
    <p>第一条真正落地的 RBAC 业务链路建议从这里开始。</p>

    <h3>计划权限</h3>
    <ul>
      <li v-for="code in permissionExamples" :key="code"><code>{{ code }}</code></li>
    </ul>

    <div class="actions">
      <button disabled>创建发布单（TODO 权限判断）</button>
      <button disabled>审批（TODO 权限判断）</button>
      <button disabled>执行发布（TODO 权限判断）</button>
    </div>
  </section>
</template>
