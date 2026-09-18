import { createApp } from 'vue'
import axios from 'axios'
import { createDjangoLocalProvider, createKeycloakProvider, createRbacPlugin } from '@scotec/vue-unified-rbac'
import type { AuthMode } from '@scotec/vue-unified-rbac'
import AuthDemo from './AuthDemo.vue'

/** Consumer examples: choose local, sso or hybrid without changing library code. */
export function createDemoRbac(mode: AuthMode) {
  const baseURL = import.meta.env.VITE_RBAC_API_ORIGIN || undefined
  const localProvider = mode === 'sso' ? undefined : createDjangoLocalProvider({ baseURL })
  const sso = mode === 'local' ? undefined : createKeycloakProvider({
    url: import.meta.env.VITE_KEYCLOAK_URL,
    realm: import.meta.env.VITE_KEYCLOAK_REALM,
    clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  })
  return createRbacPlugin({ auth: { mode, localProvider, sso }, instance: axios.create({ baseURL }) })
}
export async function bootstrapV3() {
  const selected = import.meta.env.VITE_RBAC_MODE ?? 'local'
  if (!['local', 'sso', 'hybrid'].includes(selected)) throw Error('Invalid VITE_RBAC_MODE')
  const rbac = createDemoRbac(selected as AuthMode)
  try {
    // Explicit session/callback recovery. Failure leaves the login choices visible.
    await rbac.restoreSession()
  } catch { /* The authentication/access error is displayed by the consumer. */ }
  createApp(AuthDemo).use(rbac).mount('#app')
}
