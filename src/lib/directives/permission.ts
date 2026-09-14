import { ref, watchEffect } from 'vue'
import type { ObjectDirective, Ref, WatchStopHandle } from 'vue'

import type { AccessStore } from '../access/store'

interface PermissionElementState {
  permission: Ref<unknown>
  placeholder: Comment
  stop: WatchStopHandle
}

// 仅控制 UI 可见性；每个业务请求仍必须由后端 RBAC 校验。
export function createPermissionDirective(
  accessStore: Pick<AccessStore, 'hasPermission'>,
): ObjectDirective<HTMLElement, unknown> {
  const elements = new WeakMap<HTMLElement, PermissionElementState>()
  return {
    mounted(el, binding) {
      const permission = ref<unknown>(binding.value)
      const placeholder = el.ownerDocument.createComment('v-permission')

      const stop = watchEffect(
        () => {
          const code = permission.value
          const allowed = typeof code === 'string' && accessStore.hasPermission(code)

          if (allowed) {
            placeholder.parentNode?.replaceChild(el, placeholder)
          } else {
            el.parentNode?.replaceChild(placeholder, el)
          }
        },
        { flush: 'sync' },
      )

      elements.set(el, { permission, placeholder, stop })
    },
    updated(el, binding) {
      const state = elements.get(el)
      if (state) {
        state.permission.value = binding.value
      }
    },
    beforeUnmount(el) {
      const state = elements.get(el)
      if (state) {
        state.stop()
        // 交回原元素，让 Vue 正常处理卸载及相邻节点。
        state.placeholder.parentNode?.replaceChild(el, state.placeholder)
        elements.delete(el)
      }
    },
  }
}
