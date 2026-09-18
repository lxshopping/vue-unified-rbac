import type { Pinia } from 'pinia'
import type { Plugin } from 'vue'
import type { AxiosInstance } from 'axios'
import type { AuthProvider, AuthMode } from './auth/types'
import type { LocalAuthProvider } from './auth/local-provider'
import type { HybridAuthManager, HybridAuthOptions } from './auth/hybrid-manager'
import type { AccessLoader } from './access/types'
import type { AccessStore } from './access/store'

export interface RbacAuthOptions extends HybridAuthOptions {}
export interface RbacPluginOptions {
  pinia?: Pinia
  auth?: AuthProvider | RbacAuthOptions
  mode?: AuthMode
  localProvider?: LocalAuthProvider<unknown>
  hybrid?: Omit<HybridAuthOptions, 'mode' | 'sso'>
  loadAccess?: AccessLoader
  /** Optional dedicated trusted API client for the default /me loader. */
  instance?: AxiosInstance
  accessEndpoint?: string
}
export type RbacOptions = RbacPluginOptions
export interface RbacContext {
  auth: HybridAuthManager
  accessStore: AccessStore
  /** Alias of accessStore, not a second store. */
  access: AccessStore
  /** Initialize SSO callback or explicitly probe an existing Local session, then /me. */
  restoreSession(): Promise<void>
  logout(): Promise<void>
}
export type RbacPlugin = Plugin & RbacContext
