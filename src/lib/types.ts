import type { Pinia } from 'pinia'
import type { Plugin } from 'vue'
import type { AuthProvider, AuthMode } from './auth/types'
import type { HybridAuthManager, HybridAuthOptions } from './auth/hybrid-manager'
import type { AccessLoader } from './access/types'
import type { AccessStore } from './access/store'

export interface RbacPluginOptions {
  pinia: Pinia
  auth?: AuthProvider
  mode?: AuthMode
  hybrid?: Omit<HybridAuthOptions, 'mode' | 'sso'>
  loadAccess: AccessLoader
}

export type RbacOptions = RbacPluginOptions

export interface RbacContext {
  auth: HybridAuthManager
  accessStore: AccessStore
  /** Clear permissions before delegating to the provider. */
  logout(): Promise<void>
}

export type RbacPlugin = Plugin & RbacContext
