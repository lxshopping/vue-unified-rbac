import axios from 'axios'

import {
  getAccessToken,
  isAuthenticated,
  recoverAuthentication,
  refreshToken,
} from '@/auth/keycloak'

const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
})

request.interceptors.request.use(async (config) => {
  if (!isAuthenticated()) {
    return recoverAuthentication()
  }

  try {
    await refreshToken()
  } catch {
    return recoverAuthentication()
  }

  const token = getAccessToken()
  if (!token) return recoverAuthentication()

  config.headers.Authorization = `Bearer ${token}`
  return config
})

request.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      return recoverAuthentication()
    }

    if (error.response?.status === 403) {
      console.error('当前用户没有权限')
    }

    return Promise.reject(error)
  },
)

export default request
