import type { Pinia } from 'pinia'
import type { Plugin } from 'vue'
import type { AuthProvider } from './auth/types'
import type { AccessLoader } from './access/types'
import type { AccessStore } from './access/store'

export interface RbacPluginOptions {
  pinia: Pinia
  auth: AuthProvider
  loadAccess: AccessLoader
}

export type RbacOptions = RbacPluginOptions

export interface RbacContext {
  auth: AuthProvider
  accessStore: AccessStore
  /** Clear permissions before delegating to the provider. */
  logout(): Promise<void>
}

export type RbacPlugin = Plugin & RbacContext
