export interface AuthProvider {
  init(): Promise<void>
  isAuthenticated(): boolean
  login(): Promise<void>
  logout(): Promise<void>
  getAccessToken(): string | undefined
  refreshToken(minValidity?: number): Promise<boolean>
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}
