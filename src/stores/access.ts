import { defineStore } from 'pinia'
import { ref } from 'vue'

import { fetchMyAccess } from '@/api/rbac'
import type { RbacMe } from '@/types/rbac'

export const useAccessStore = defineStore('access', () => {
  const me = ref<RbacMe | null>(null)
  const loaded = ref(false)
  const error = ref<string | null>(null)

  async function loadMyAccess() {
    me.value = null
    loaded.value = false
    error.value = null

    try {
      me.value = await fetchMyAccess()
      return me.value
    } catch (cause) {
      // 失败时清空权限，不能继续使用之前加载成功的权限。
      me.value = null
      error.value = cause instanceof Error ? cause.message : '加载权限失败'
      throw cause
    } finally {
      // loaded 表示本次加载已结束，是否成功由 me / error 表达。
      loaded.value = true
    }
  }

  function hasPermission(code: string): boolean {
    if (!me.value) {
      return false
    }

    // 只使用后端返回的权限，不从角色推导权限。
    return me.value.permissions.includes(code)
  }

  function reset() {
    me.value = null
    loaded.value = false
    error.value = null
  }

  return {
    me,
    loaded,
    error,
    loadMyAccess,
    hasPermission,
    reset,
  }
})
