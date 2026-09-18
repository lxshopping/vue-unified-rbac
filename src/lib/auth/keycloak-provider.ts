import Keycloak from 'keycloak-js'
import type { KeycloakInitOptions, KeycloakLoginOptions, KeycloakLogoutOptions } from 'keycloak-js'
import { AuthenticationError } from './types'
import type { AuthProvider } from './types'

export interface KeycloakProviderOptions {
  url: string
  realm: string
  clientId: string
  initOptions?: Omit<KeycloakInitOptions, 'flow' | 'pkceMethod'>
  loginOptions?: KeycloakLoginOptions
  logoutOptions?: KeycloakLogoutOptions
}

/** One SDK instance per provider; tokens remain in SDK memory. */
export class KeycloakAuthProvider implements AuthProvider {
  private keycloak?: Keycloak
  private initialization?: Promise<void>

  constructor(private readonly options: KeycloakProviderOptions) {}

  init(): Promise<void> {
    return (this.initialization ??= this.initialize())
  }

  initPassive(): Promise<void> {
    return (this.initialization ??= this.initialize(true))
  }

  private async initialize(passive = false): Promise<void> {
    const { url, realm, clientId, initOptions } = this.options
    if (!url || !realm || !clientId) {
      throw new AuthenticationError('缺少 Keycloak 配置：url / realm / clientId。')
    }

    this.keycloak = new Keycloak({ url, realm, clientId })
    const options: KeycloakInitOptions = {
      onLoad: 'login-required',
      checkLoginIframe: false,
      ...initOptions,
      flow: 'standard',
      pkceMethod: 'S256',
    }
    // Process OIDC callbacks, but never start an automatic login/check-sso redirect.
    if (passive) delete options.onLoad
    const authenticated = await this.keycloak.init(options)
    // Runtime recovery belongs to the host. Prevent SDK clearToken() from
    // silently starting a second login and bypassing the host's retry policy.
    this.keycloak.loginRequired = false
    if (options.onLoad === 'login-required' && !authenticated) {
      throw new AuthenticationError('SSO 登录尚未完成，请重新加载页面。')
    }
  }

  private getClient(): Keycloak {
    if (!this.keycloak) throw new AuthenticationError('Keycloak 尚未初始化。')
    return this.keycloak
  }

  isAuthenticated(): boolean {
    return this.keycloak?.authenticated === true
  }

  getAccessToken(): string | undefined {
    return this.keycloak?.token
  }

  async refreshToken(minValidity = 30): Promise<boolean> {
    if (!this.isAuthenticated()) throw new AuthenticationError('SSO 登录状态已失效。')
    return this.getClient().updateToken(minValidity)
  }

  async login(): Promise<void> {
    await this.getClient().login(this.options.loginOptions)
  }

  async logout(): Promise<void> {
    await this.getClient().logout(this.options.logoutOptions)
  }

  /** Invalidate SDK memory when the host detects an expired/rejected session. */
  clearToken(): void {
    this.keycloak?.clearToken()
  }
}

export function createKeycloakProvider(options: KeycloakProviderOptions): KeycloakAuthProvider {
  return new KeycloakAuthProvider(options)
}
