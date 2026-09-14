import { readonly, ref } from 'vue'
import { AuthenticationError, createKeycloakProvider } from '@scotec/vue-unified-rbac'

// Host configuration and recovery policy; neither belongs to the library.
export const auth = createKeycloakProvider({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID,
  get loginOptions() {
    return { prompt: 'login' as const, redirectUri: window.location.href }
  },
  get logoutOptions() {
    return { redirectUri: window.location.origin }
  },
})

const RELOGIN_FLAG = 'rbac.sso.relogin-attempted'
const authError = ref<string | null>(null)
export const authenticationError = readonly(authError)
let loginInProgress = false

export async function login(): Promise<void> {
  if (loginInProgress) return
  loginInProgress = true
  try {
    try {
      sessionStorage.setItem(RELOGIN_FLAG, '1')
    } catch {
      // 存储受限时仍允许主动登录，自动恢复则停止，避免跨页面循环。
    }
    await auth.login()
  } catch {
    loginInProgress = false
    authError.value = '无法跳转到 SSO 登录页，请检查连接后重新登录。'
    throw new AuthenticationError(authError.value)
  }
}

export async function recoverAuthentication(): Promise<never> {
  authError.value = '登录状态已失效，正在前往 SSO 登录页。'
  auth.clearToken()
  if (loginInProgress) throw new AuthenticationError(authError.value)

  let attempted: boolean
  try {
    attempted = sessionStorage.getItem(RELOGIN_FLAG) === '1'
    if (!attempted) sessionStorage.setItem(RELOGIN_FLAG, '1')
  } catch {
    authError.value = '浏览器无法保存重登标记，已停止自动重登。请点击“重新登录”。'
    throw new AuthenticationError(authError.value)
  }
  if (attempted) {
    authError.value = '重新登录后认证仍然失败，已停止自动重登。请检查 SSO 与后端配置后重试。'
    throw new AuthenticationError(authError.value)
  }

  await login()
  throw new AuthenticationError(authError.value)
}

export async function logout(): Promise<void> {
  try {
    sessionStorage.removeItem(RELOGIN_FLAG)
  } catch {
    // 不影响服务端会话注销。
  }
  await auth.logout()
}
