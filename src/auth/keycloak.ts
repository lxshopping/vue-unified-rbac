import Keycloak from 'keycloak-js'
import { readonly, ref } from 'vue'

// 每个标签页最多自动重登一次，直到用户主动 Logout；绝不持久化任何 Token。
const RELOGIN_FLAG = 'rbac.sso.relogin-attempted'
const authError = ref<string | null>(null)
export const authenticationError = readonly(authError)
let keycloak: Keycloak | undefined
let initialization: Promise<boolean> | undefined
let loginInProgress = false

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthenticationError'
  }
}

export function initKeycloak(): Promise<boolean> {
  return (initialization ??= initialize())
}

async function initialize(): Promise<boolean> {
  const url = import.meta.env.VITE_KEYCLOAK_URL
  const realm = import.meta.env.VITE_KEYCLOAK_REALM
  const clientId = import.meta.env.VITE_KEYCLOAK_CLIENT_ID

  if (!url || !realm || !clientId) {
    throw new Error('缺少 Keycloak 配置，请检查 VITE_KEYCLOAK_URL / REALM / CLIENT_ID。')
  }

  keycloak = new Keycloak({ url, realm, clientId })
  const authenticated = await keycloak.init({
    onLoad: 'login-required',
    flow: 'standard',
    pkceMethod: 'S256',
    checkLoginIframe: false,
  })

  // SDK 的 clearToken() 在 loginRequired 为 true 时会自行 login()。
  // 首次认证仍由 login-required 完成；运行期间的重登统一走下方防循环入口。
  keycloak.loginRequired = false

  if (!authenticated) {
    throw new AuthenticationError('SSO 登录尚未完成，请重新加载页面。')
  }

  return authenticated
}

export function isAuthenticated(): boolean {
  return keycloak?.authenticated === true
}

export function getAccessToken(): string | undefined {
  return keycloak?.token
}

export async function refreshToken(): Promise<boolean> {
  if (!keycloak?.authenticated) {
    throw new AuthenticationError('SSO 登录状态已失效。')
  }
  return keycloak.updateToken(30)
}

// 用户点击“重新登录”可主动再试；每次回跳后若仍为 401，自动重登仍被阻止。
export async function login(): Promise<void> {
  if (loginInProgress) return
  if (!keycloak) throw new AuthenticationError('Keycloak 尚未初始化。')

  loginInProgress = true
  try {
    try {
      sessionStorage.setItem(RELOGIN_FLAG, '1')
    } catch {
      // 禁止存储时仍允许用户主动登录；自动重登入口会停止，避免跨页面循环。
    }
    await keycloak.login({ prompt: 'login', redirectUri: window.location.href })
  } catch {
    loginInProgress = false
    authError.value = '无法跳转到 SSO 登录页，请检查连接后重新登录。'
    throw new AuthenticationError(authError.value)
  }
}

export async function recoverAuthentication(): Promise<never> {
  authError.value = '登录状态已失效，正在前往 SSO 登录页。'
  keycloak?.clearToken()

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
  // 正常情况下 login() 会离开页面；若跳转尚未发生，也不允许继续发出业务请求。
  throw new AuthenticationError(authError.value)
}

export async function logout(): Promise<void> {
  if (!keycloak) throw new AuthenticationError('Keycloak 尚未初始化。')
  try {
    sessionStorage.removeItem(RELOGIN_FLAG)
  } catch {
    // 不影响 Keycloak 服务端会话注销。
  }
  await keycloak.logout({ redirectUri: window.location.origin })
}
