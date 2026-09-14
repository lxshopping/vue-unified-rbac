import axios from 'axios'
import { installAuthInterceptor } from '@scotec/vue-unified-rbac'
import { auth, recoverAuthentication } from '@/auth/keycloak'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

installAuthInterceptor(request, auth, { onAuthError: recoverAuthentication })

// Response handling remains entirely host-owned.
request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) return recoverAuthentication()
    if (error.response?.status === 403) console.error('当前用户没有权限')
    return Promise.reject(error)
  },
)

export default request
