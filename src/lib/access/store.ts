import { defineStore, getActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { computed, ref } from 'vue'

import { AuthenticationError } from '../auth/types'
import type { AuthProvider } from '../auth/types'
import { normalizeAccess } from './types'
import type { AccessLoader, AccessResult } from './types'

interface AccessStoreOptions {
  auth: AuthProvider
  loadAccess: AccessLoader
}

function defineAccessStore({ auth, loadAccess }: AccessStoreOptions) {
  return defineStore('scotec:rbac:access', () => {
    const me = ref<AccessResult | null>(null)
    // 复用 me，保持现有页面兼容，不维护第二份权限状态。
    const username = computed(() => me.value?.username ?? '')
    const authSource = computed(() => me.value?.auth_source ?? me.value?.authSource ?? null)
    const roles = computed(() => me.value?.roles ?? [])
    const permissions = computed(() => me.value?.permissions ?? [])
    const loaded = ref(false)
    const loading = ref(false)
    const error = ref<string | null>(null)
    let loadVersion = 0
    let pendingLoad: Promise<AccessResult | null> | null = null

    function loadMyAccess(): Promise<AccessResult | null> {
      if (pendingLoad) {
        return pendingLoad
      }

      const version = ++loadVersion
      me.value = null
      loaded.value = false
      loading.value = true
      error.value = null

      // Schedule after assigning pendingLoad, including synchronous loader failures.
      pendingLoad = Promise.resolve().then(async () => {
        try {
          if (!auth.isAuthenticated()) throw new AuthenticationError('登录状态已失效。')
          const data = normalizeAccess(await loadAccess())
          // clearAccess 后，旧请求不得重新写入上一位用户的权限。
          if (version !== loadVersion) {
            return null
          }
          if (!auth.isAuthenticated()) throw new AuthenticationError('登录状态已失效。')
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
      })

      return pendingLoad
    }

    function hasPermission(code: string): boolean {
      if (
        !loaded.value ||
        loading.value ||
        error.value !== null ||
        !auth.isAuthenticated() ||
        typeof code !== 'string' ||
        code.trim().length === 0 ||
        !Array.isArray(permissions.value)
      ) {
        return false
      }

      // 只使用后端返回的权限，不从角色推导权限。
      return permissions.value.includes(code)
    }

    function hasAnyPermission(codes: readonly string[]): boolean {
      return Array.isArray(codes) && codes.some((code) => hasPermission(code))
    }

    function hasAllPermissions(codes: readonly string[]): boolean {
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

    function reloadAccess(): Promise<AccessResult | null> {
      clearAccess()
      return loadMyAccess()
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
      reloadAccess,
      hasPermission,
      hasAnyPermission,
      hasAllPermissions,
      clearAccess,
      reset: clearAccess,
    }
  })
}

export type AccessStore = ReturnType<ReturnType<typeof defineAccessStore>>

// Each host Pinia owns its own loader, provider and permissions.
const stores = new WeakMap<Pinia, AccessStore>()

/** Internal setup entry; configure once per host Pinia. */
export function initializeAccessStore(pinia: Pinia, options: AccessStoreOptions): AccessStore {
  if (stores.has(pinia)) throw new Error('RBAC 已在此 Pinia 中初始化，请复用同一个 Plugin。')
  const store = defineAccessStore(options)(pinia)
  stores.set(pinia, store)
  return store
}

export function useAccessStore(pinia?: Pinia): AccessStore {
  const instance = pinia ?? getActivePinia()
  const store = instance && stores.get(instance)
  if (!store) throw new Error('请先调用 createRbacPlugin({ pinia, auth, loadAccess })。')
  return store
}
