import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { RbacMe } from '@/types/rbac'

/**
 * Access Store 只保存后端已经算好的有效权限。
 *
 * PSEUDOCODE:
 *
 * state:
 *   me = null
 *   loaded = false
 *
 * loadMyAccess():
 *   me = await fetchMyAccess()
 *   loaded = true
 *
 * hasPermission(code):
 *   if me is null:
 *       return false
 *   return code in me.permissions
 *
 * reset():
 *   me = null
 *   loaded = false
 *
 * 禁止：
 *   if role == 'admin': return true
 *   role -> permissions 的映射不得出现在 Vue。
 */
export const useAccessStore = defineStore('access', () => {
  const me = ref<RbacMe | null>(null)
  const loaded = ref(false)

  // TODO: 下一阶段实现 fetchMyAccess() 调用。
  async function loadMyAccess() {
    throw new Error('TODO: load /api/rbac/me into access store')
    // me.value = await fetchMyAccess()
    // loaded.value = true
    // return me.value
  }

  // TODO: 自己先按上面的伪代码实现这一行核心逻辑。
  function hasPermission(_code: string): boolean {
    // TODO: permission_code
    // permissions[]
    // if permission_code in permissions: return true else return false
    return false
  }

  function reset() {
    me.value = null
    loaded.value = false
  }

  return {
    me,
    loaded,
    loadMyAccess,
    hasPermission,
    reset,
  }
})
