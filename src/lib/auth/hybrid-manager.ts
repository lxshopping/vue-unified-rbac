import { shallowRef } from 'vue'
import { AuthenticationError } from './types'
import type { AuthMode, AuthProvider, AuthSource } from './types'
import type { LocalAuthProvider } from './local-provider'

export interface HybridAuthOptions {
  mode: AuthMode
  sso?: AuthProvider
  localProvider?: LocalAuthProvider<unknown>
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
  private localPending = false
  private readonly failure = shallowRef<string | null>(null)
  private accessLoader?: () => Promise<unknown>
  private readonly key: string
  constructor(private readonly options: HybridAuthOptions) {
    if (!['local', 'sso', 'hybrid'].includes(options.mode)) throw new Error('Invalid auth mode')
    if (options.mode !== 'local' && !options.sso) throw new Error('SSO provider is required')
    this.key = options.storageKey ?? 'scotec.rbac.auth_source'
    this.restoreAuthSource()
  }
  get mode(): AuthMode { return this.options.mode }
  get error(): string | null { return this.failure.value }
  /** Plugin wiring: authentication completion refreshes the single AccessStore. */
  bindAccessLoader(loader: () => Promise<unknown>): void { this.accessLoader = loader }
  getLocalRequestConfig() { return this.isLocal() ? this.options.localProvider?.getRequestConfig?.() : undefined }
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
  setAuthSource(source: Exclude<AuthSource, null>): void {
    if (!['local', 'sso'].includes(source) || (this.mode !== 'hybrid' && source !== this.mode)) {
      throw new AuthenticationError('认证来源与系统模式不匹配。')
    }
    try { this.storage()?.setItem(this.key, source) } catch { /* In-memory login remains usable. */ }
    // Same-source login may belong to another user: invalidate old access too.
    this.failure.value = null
    this.change(source)
  }
  /** Only called after a validated /me response; server source supersedes cached selection. */
  reconcileAuthSource(source: string | undefined): void {
    if ((source !== 'local' && source !== 'sso') || source === this.source) return
    try { this.storage()?.setItem(this.key, source) } catch { /* Memory remains authoritative. */ }
    // The store is already loading with permissions revoked. Do not cancel that load.
    this.current.value = source
    this.revision++
  }
  async notifyLocalAuthenticated(): Promise<void> {
    this.setAuthSource('local')
    await this.accessLoader?.()
  }
  async loginLocal<Credentials>(credentials: Credentials): Promise<void> {
    if (this.mode === 'sso' || !this.options.localProvider) {
      throw new AuthenticationError('Local provider is not configured for this mode.')
    }
    if (this.localPending) throw new AuthenticationError('Local login is already in progress.')
    this.localPending = true
    this.clearAuthSource()
    this.failure.value = null
    let revision = this.revision
    try {
      await this.options.localProvider.login(credentials)
      if (revision !== this.revision) throw new AuthenticationError('认证会话已切换。')
      this.setAuthSource('local')
      revision = this.revision
      await this.accessLoader?.()
    } catch (error) {
      if (revision === this.revision) {
        this.clearAuthSource()
        this.failure.value = 'Local authentication failed.'
      }
      throw error
    } finally { this.localPending = false }
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
    if (this.isLocal()) await this.options.localProvider?.initCsrf?.()
    if (!this.isSso()) return
    if (this.mode === 'hybrid') {
      if (!this.options.sso?.initPassive) throw new AuthenticationError('Hybrid SSO provider must implement initPassive().')
      await this.options.sso.initPassive()
    } else await this.options.sso!.init()
  }
  isAuthenticated(): boolean {
    if (this.isLocal()) return this.options.isLocalAuthenticated?.() ?? true
    return this.isSso() && (this.options.sso?.isAuthenticated() ?? false)
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
  getAccessToken(): string | undefined { return this.isSso() ? this.options.sso?.getAccessToken() : undefined }
  async refreshToken(minValidity?: number): Promise<boolean> {
    return this.isSso() ? this.options.sso!.refreshToken(minValidity) : false
  }
  clearToken(): void { if (this.isSso()) this.options.sso?.clearToken?.() }
  async handleAuthError(error: unknown): Promise<void> {
    const source = this.source
    this.failure.value = error instanceof Error ? error.message : 'Authentication failed.'
    try { if (source === 'sso') this.clearToken() } finally { this.clearAuthSource() }
    if (source === 'local') await this.options.onLocalAuthError?.(error)
    else if (source === 'sso') await this.options.onAuthError?.(error)
  }
  async logout(): Promise<void> {
    const source = this.source
    this.clearAuthSource()
    if (source === 'local') {
      if (this.options.localProvider) await this.options.localProvider.logout()
      else await this.options.localLogout?.()
    }
    else if (source === 'sso') {
      try { await this.options.sso!.logout() } finally { this.options.sso?.clearToken?.() }
    }
  }
}
export function createHybridAuthManager(options: HybridAuthOptions): HybridAuthManager {
  return new HybridAuthManager(options)
}
