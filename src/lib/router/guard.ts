import type { Router, RouteLocationRaw, RouteLocationNormalized } from 'vue-router'
import type { AccessStore } from '../access/store'

export interface RouterGuardOptions {
  accessStore: AccessStore
  permissionMetaKey?: string
  forbiddenRoute?: RouteLocationRaw
  /** Optional host error page; missing permission still goes to forbiddenRoute. */
  accessErrorRoute?: RouteLocationRaw
}

export function installRbacGuard(router: Router, options: RouterGuardOptions): () => void {
  const { accessStore, permissionMetaKey = 'permission', forbiddenRoute = '/403' } = options
  function redirect(to: RouteLocationNormalized, target: RouteLocationRaw) {
    const destination = router.resolve(target)
    const record = destination.matched.at(-1)
    const current = to.matched.at(-1)
    // A misconfigured protected error route must neither loop nor be authorized.
    if (to.path === destination.path || (record && current &&
      (record.aliasOf ?? record) === (current.aliasOf ?? current))) return false
    return target
  }

  return router.beforeEach(async (to) => {
    if (!(permissionMetaKey in to.meta) && to.meta.requiresAuth !== true) return true

    if (!accessStore.loaded || accessStore.loading) {
      try {
        await accessStore.loadMyAccess()
      } catch {
        return redirect(to, options.accessErrorRoute ?? forbiddenRoute)
      }
    }
    if (!accessStore.isAuthenticated || accessStore.error || !accessStore.me) {
      return redirect(to, options.accessErrorRoute ?? forbiddenRoute)
    }

    if (!(permissionMetaKey in to.meta)) return true
    const permission: unknown = to.meta[permissionMetaKey]
    if (typeof permission === 'string' && accessStore.hasPermission(permission)) return true
    return redirect(to, forbiddenRoute)
  })
}
