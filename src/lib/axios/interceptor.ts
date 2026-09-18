import type { AxiosInstance } from 'axios'
import { AuthenticationError } from '../auth/types'
import type { AuthProvider } from '../auth/types'
import { HybridAuthManager } from '../auth/hybrid-manager'
import type { AccessStore } from '../access/store'

export interface AuthInterceptorOptions {
  minValidity?: number
  onAuthError?: (error: unknown) => void | Promise<void>
  onLocalAuthError?: (error: unknown) => void | Promise<void>
  /** Optional for legacy providers; plugin managers invalidate their store automatically. */
  accessStore?: Pick<AccessStore, 'clearAccess'>
}

/** Install once on a trusted host API instance. Never install on third-party origins. */
export function installAuthInterceptor(
  instance: AxiosInstance,
  auth: AuthProvider,
  options: AuthInterceptorOptions = {},
): () => void {
  const manager = auth instanceof HybridAuthManager ? auth : undefined
  const sessions = new WeakMap<object, { revision: number; source: string | null }>()
  async function fail(error: unknown, source: string | null) {
    options.accessStore?.clearAccess()
    if (manager) await manager.handleAuthError(error)
    else auth.clearToken?.()
    if (source === 'local') await options.onLocalAuthError?.(error)
    else if (source === 'sso') await options.onAuthError?.(error)
  }
  const id = instance.interceptors.request.use(async (config) => {
    const source = manager ? manager.source : 'sso'
    const revision = manager?.getRevision() ?? 0
    sessions.set(config, { source, revision })
    // Host cookies, sessions and existing Authorization headers remain untouched.
    if (source !== 'sso') return config
    let token: string | undefined
    try {
      if (!auth.isAuthenticated()) throw new AuthenticationError('登录状态已失效。')
      await auth.refreshToken(options.minValidity ?? 30)
      if (manager && revision !== manager.getRevision()) throw new AuthenticationError('认证会话已切换。')
      token = auth.getAccessToken()
      if (!auth.isAuthenticated() || !token) throw new AuthenticationError('无法获取 Access Token。')
    } catch (error) {
      if (!manager || revision === manager.getRevision()) await fail(error, source)
      throw error
    }
    config.headers.set('Authorization', 'Bearer ' + token)
    return config
  })
  // Preserve 0.1.x raw-provider response handling unless explicitly opting in.
  const responseId = manager || options.accessStore || options.onLocalAuthError
    ? instance.interceptors.response.use(response => response, async (error: unknown) => {
      const failure = error as { response?: { status?: number }; config?: object }
      const session = failure.config && sessions.get(failure.config)
      if (failure.response?.status === 401 && session && session.source &&
          (!manager || session.revision === manager.getRevision())) {
        await fail(error, session.source)
      }
      throw error
    }) : undefined
  return () => {
    instance.interceptors.request.eject(id)
    if (responseId !== undefined) instance.interceptors.response.eject(responseId)
  }
}
