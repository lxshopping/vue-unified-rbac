import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { fetchMyAccess } from '@/api/rbac'
import type { RbacMe } from '@/types/rbac'

export const useAccessStore = defineStore('access', () => {
  const me = ref<RbacMe | null>(null)
  // 复用 me，保持现有页面兼容，不维护第二份权限状态。
  const username = computed(() => me.value?.username ?? '')
  const authSource = computed(() => me.value?.authSource ?? null)
  const roles = computed(() => me.value?.roles ?? [])
  const permissions = computed(() => me.value?.permissions ?? [])
  const loaded = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)
  let loadVersion = 0
  let pendingLoad: Promise<RbacMe | null> | null = null

  function loadMyAccess(): Promise<RbacMe | null> {
    if (pendingLoad) {
      return pendingLoad
    }

    const version = ++loadVersion
    me.value = null
    loaded.value = false
    loading.value = true
    error.value = null

    pendingLoad = (async () => {
      try {
        const data = await fetchMyAccess()
        // clearAccess 后，旧请求不得重新写入上一位用户的权限。
        if (version !== loadVersion) {
          return null
        }
        me.value = data
        return data
      } catch (cause) {
        if (version === loadVersion) {
          // 失败时清空权限，不能继续使用之前加载成功的权限。
          me.value = null
          error.value = cause instanceof Error ? cause.message : '加载权限失败'
        }
        throw cause
      } finally {
        if (version === loadVersion) {
          // 保留现有语义：loaded 表示本次加载已结束，成功与否由 me / error 表达。
          loaded.value = true
          loading.value = false
          pendingLoad = null
        }
      }
    })()

    return pendingLoad
  }

  function hasPermission(code: string): boolean {
    if (
      !loaded.value ||
      loading.value ||
      error.value !== null ||
      typeof code !== 'string' ||
      code.trim().length === 0 ||
      !Array.isArray(permissions.value)
    ) {
      return false
    }

    // 只使用后端返回的权限，不从角色推导权限。
    return permissions.value.includes(code)
  }

  function hasAnyPermission(codes: string[]): boolean {
    return Array.isArray(codes) && codes.some((code) => hasPermission(code))
  }

  function hasAllPermissions(codes: string[]): boolean {
    // 空数组也采用 default deny；Array.from 让稀疏数组中的空项参与校验。
    return (
      Array.isArray(codes) &&
      codes.length > 0 &&
      Array.from(codes).every((code) => hasPermission(code))
    )
  }

  function clearAccess() {
    loadVersion += 1
    pendingLoad = null
    me.value = null
    loaded.value = false
    loading.value = false
    error.value = null
  }

  return {
    me,
    username,
    authSource,
    roles,
    permissions,
    loaded,
    loading,
    error,
    loadMyAccess,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    clearAccess,
    reset: clearAccess,
  }
})
