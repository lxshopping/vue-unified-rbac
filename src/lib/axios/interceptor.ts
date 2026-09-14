import type { AxiosInstance } from 'axios'
import { AuthenticationError } from '../auth/types'
import type { AuthProvider } from '../auth/types'

export interface AuthInterceptorOptions {
  minValidity?: number
  /** Host-owned recovery/UI. The request is rejected even if this resolves. */
  onAuthError?: (error: unknown) => void | Promise<void>
}

/** Install on a trusted API instance owned by the host; return an eject handle. */
export function installAuthInterceptor(
  instance: AxiosInstance,
  auth: AuthProvider,
  options: AuthInterceptorOptions = {},
): () => void {
  const id = instance.interceptors.request.use(async (config) => {
    let token: string | undefined
    try {
      if (!auth.isAuthenticated()) throw new AuthenticationError('登录状态已失效。')
      await auth.refreshToken(options.minValidity ?? 30)
      token = auth.getAccessToken()
      if (!auth.isAuthenticated() || !token) throw new AuthenticationError('无法获取 Access Token。')
    } catch (error) {
      await options.onAuthError?.(error)
      throw error
    }
    config.headers.set('Authorization', `Bearer ${token}`)
    return config
  })
  return () => instance.interceptors.request.eject(id)
}
