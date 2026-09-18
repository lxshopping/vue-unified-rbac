import axios from 'axios'
import type { AxiosInstance, AxiosRequestConfig } from 'axios'
import { AuthenticationError } from './types'

export type LocalRequestConfig = Pick<AxiosRequestConfig, 'baseURL' | 'withCredentials' | 'xsrfCookieName' | 'xsrfHeaderName' | 'withXSRFToken'> & { headers?: Record<string, string> }

export interface LocalLoginCredentials { username: string; password: string }

/** Authentication only. Never returns or stores authorization data. */
export interface LocalAuthProvider<Credentials = LocalLoginCredentials> {
  login(credentials: Credentials): Promise<void>
  logout(): Promise<void>
  initCsrf?(): Promise<void>
  /** Applied only to trusted Local API requests by the auth interceptor. */
  getRequestConfig?(): LocalRequestConfig
}

export interface HostLocalProviderOptions<Credentials = LocalLoginCredentials> {
  login(credentials: Credentials): void | Promise<void>
  logout(): void | Promise<void>
}

export function createHostLocalProvider<Credentials = LocalLoginCredentials>(
  options: HostLocalProviderOptions<Credentials>,
): LocalAuthProvider<Credentials> {
  return {
    async login(credentials) { await options.login(credentials) },
    async logout() { await options.logout() },
  }
}

export interface DjangoLocalProviderOptions {
  /** Dedicated auth client; do not install the SSO interceptor on this instance. */
  instance?: AxiosInstance
  baseURL?: string
  endpoints?: { csrf?: string; login?: string; logout?: string }
  withCredentials?: boolean
  csrfCookieName?: string
  csrfHeaderName?: string
}

export function createDjangoLocalProvider(options: DjangoLocalProviderOptions = {}): LocalAuthProvider {
  const client = options.instance ?? axios.create({ baseURL: options.baseURL })
  const endpoints = {
    csrf: '/api/rbac/auth/local/csrf', login: '/api/rbac/auth/local/login',
    logout: '/api/rbac/auth/local/logout', ...options.endpoints,
  }
  const header = options.csrfHeaderName ?? 'X-CSRFToken'
  // CSRF tokens may live in memory; passwords and authorization never do.
  let csrfToken: string | undefined
  function getRequestConfig(): LocalRequestConfig {
    return {
      baseURL: options.baseURL ?? client.defaults.baseURL,
      withCredentials: options.withCredentials ?? true,
      xsrfCookieName: options.csrfCookieName ?? 'csrftoken',
      xsrfHeaderName: header,
      // A response-body token belongs to the API origin. Do not overwrite it
      // with an unrelated frontend-origin cookie in a cross-origin deployment.
      withXSRFToken: !csrfToken,
      headers: csrfToken ? { [header]: csrfToken } : {},
    }
  }
  async function initCsrf() {
    csrfToken = undefined
    const { data } = await client.get<unknown>(endpoints.csrf, getRequestConfig())
    if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
      csrfToken = data.csrfToken
    }
    // Cookie-only backends are supported by Axios's browser XSRF transport.
  }
  return {
    initCsrf, getRequestConfig,
    async login(credentials) {
      await initCsrf()
      const { data } = await client.post(endpoints.login, credentials, getRequestConfig())
      if (data?.authenticated !== true) throw new AuthenticationError('Local login was not confirmed.')
      // Django rotates the secret at login, including HttpOnly/session CSRF.
      await initCsrf()
    },
    async logout() {
      try {
        await initCsrf()
        await client.post(endpoints.logout, {}, getRequestConfig())
      } finally { csrfToken = undefined }
    },
  }
}
