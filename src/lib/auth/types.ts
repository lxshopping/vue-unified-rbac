export interface AuthProvider {
  init(): Promise<void>
  /** Initialization without navigation, required for hybrid SSO. */
  initPassive?(): Promise<void>
  clearToken?(): void
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  getAccessToken(): string | undefined
  refreshToken(minValidity?: number): Promise<boolean>
}
export type AuthMode = 'local' | 'sso' | 'hybrid'
export type AuthSource = 'local' | 'sso'
export class AuthenticationError extends Error {
  constructor(message: string) { super(message); this.name = 'AuthenticationError' }
}
