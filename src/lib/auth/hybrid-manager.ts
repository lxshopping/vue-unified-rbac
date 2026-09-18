import { shallowRef } from 'vue'
import { AuthenticationError } from './types'
import type { AuthMode, AuthProvider, AuthSource } from './types'

export interface HybridAuthOptions {
  mode: AuthMode
  sso?: AuthProvider
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null
  storageKey?: string
  localLogout?: () => void | Promise<void>
  isLocalAuthenticated?: () => boolean
  onLocalAuthError?: (error: unknown) => void | Promise<void>
  onAuthError?: (error: unknown) => void | Promise<void>
}

/** Authentication coordination only; /me remains the sole authorization source. */
export class HybridAuthManager implements AuthProvider {
  private readonly current = shallowRef<AuthSource | null>(null)
  private readonly listeners = new Set<() => void>()
  private revision = 0
  private loginPending?: Promise<void>
  private readonly key: string
  constructor(private readonly options: HybridAuthOptions) {
    if (!['local', 'sso', 'hybrid'].includes(options.mode)) throw new Error('Invalid auth mode')
    if (options.mode !== 'local' && !options.sso) throw new Error('SSO provider is required')
    this.key = options.storageKey ?? 'scotec.rbac.auth_source'
    this.restoreAuthSource()
  }
  get mode(): AuthMode { return this.options.mode }
  get source(): AuthSource | null { return this.current.value }
  getMode(): AuthMode { return this.mode }
  getAuthSource(): AuthSource | null { return this.source }
  getRevision(): number { return this.revision }
  isLocal(): boolean { return this.source === 'local' }
  isSso(): boolean { return this.source === 'sso' }
  private storage() {
    if (this.options.storage !== undefined) return this.options.storage
    try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null }
  }
  onSessionChange(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }
  private change(source: AuthSource | null) {
    this.current.value = source
    this.revision++
    for (const callback of this.listeners) callback()
  }
  setAuthSource(source: AuthSource): void {
    if (!['local', 'sso'].includes(source) || (this.mode !== 'hybrid' && source !== this.mode)) {
      throw new AuthenticationError('认证来源与系统模式不匹配。')
    }
    try { this.storage()?.setItem(this.key, source) } catch { /* In-memory login remains usable. */ }
    // Same-source login may belong to another user: invalidate old access too.
    this.change(source)
  }
  markLocalAuthenticated(): void { this.setAuthSource('local') }
  clearAuthSource(): void {
    try { this.storage()?.removeItem(this.key) } catch { /* /me validates restored markers. */ }
    this.change(null)
  }
  restoreAuthSource(): AuthSource | null {
    let source: string | null = null
    try { source = this.storage()?.getItem(this.key) ?? null } catch { /* No persistence. */ }
    const valid = (source === 'local' || source === 'sso') && (this.mode === 'hybrid' || this.mode === source)
    this.change(valid ? source as AuthSource : this.mode === 'sso' ? 'sso' : null)
    return this.source
  }
  async init(): Promise<void> {
    if (!this.isSso()) return
    if (this.mode === 'hybrid') {
      if (!this.options.sso?.initPassive) throw new AuthenticationError('Hybrid SSO provider must implement initPassive().')
      await this.options.sso.initPassive()
    } else await this.options.sso!.init()
  }
  isAuthenticated(): boolean {
    if (this.isLocal()) return this.options.isLocalAuthenticated?.() ?? true
    return this.isSso() && this.options.sso!.isAuthenticated()
  }
  loginSso(): Promise<void> {
    if (this.mode === 'local') return Promise.reject(new AuthenticationError('Local 模式不支持 SSO。'))
    if (this.loginPending) return this.loginPending
    this.setAuthSource('sso')
    const revision = this.revision
    this.loginPending = Promise.resolve().then(async () => {
      try {
        await this.init()
        if (revision === this.revision) await this.options.sso!.login()
      } catch (error) {
        if (revision === this.revision) this.clearAuthSource()
        throw error
      } finally { this.loginPending = undefined }
    })
    return this.loginPending
  }
  login(): Promise<void> { return this.loginSso() }
  getAccessToken(): string | undefined { return this.isSso() ? this.options.sso!.getAccessToken() : undefined }
  async refreshToken(minValidity?: number): Promise<boolean> {
    return this.isSso() ? this.options.sso!.refreshToken(minValidity) : false
  }
  clearToken(): void { if (this.isSso()) this.options.sso?.clearToken?.() }
  async handleAuthError(error: unknown): Promise<void> {
    const source = this.source
    try { if (source === 'sso') this.clearToken() } finally { this.clearAuthSource() }
    if (source === 'local') await this.options.onLocalAuthError?.(error)
    else if (source === 'sso') await this.options.onAuthError?.(error)
  }
  async logout(): Promise<void> {
    const source = this.source
    this.clearAuthSource()
    if (source === 'local') await this.options.localLogout?.()
    else if (source === 'sso') {
      try { await this.options.sso!.logout() } finally { this.options.sso?.clearToken?.() }
    }
  }
}
export function createHybridAuthManager(options: HybridAuthOptions): HybridAuthManager {
  return new HybridAuthManager(options)
}
