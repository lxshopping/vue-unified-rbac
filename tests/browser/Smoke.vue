<script setup lang="ts">
import { computed, ref, getCurrentInstance } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView, RouterLink } from 'vue-router'
import axios from 'axios'
import { createRbacPlugin, installRbacGuard, installAuthInterceptor, filterMenus } from '../../src/lib'
import type { AuthProvider } from '../../src/lib'

const app = getCurrentInstance()!.appContext.app
const pinia = createPinia()
app.use(pinia)
const scenario = ref('all')
const tokenSent = ref(false)
const loggedOut = ref(false)
const auth: AuthProvider = {
  async init() {},
  isAuthenticated: () => !loggedOut.value,
  async login() {},
  async logout() { loggedOut.value = true },
  getAccessToken: () => loggedOut.value ? undefined : 'test-memory-token',
  async refreshToken() { return false },
}
const request = axios.create({ baseURL: '/test-only' })
request.defaults.adapter = async config => {
  tokenSent.value = config.headers.get('Authorization') === 'Bearer test-memory-token'
  if (scenario.value === 'error') throw new Error('模拟权限接口失败')
  const permissions = scenario.value === 'all'
    ? ['test.item.read', 'test.item.approve']
    : scenario.value === 'viewer' ? ['test.item.read'] : []
  return { data: { roles: ['admin'], permissions }, config, status: 200, statusText: 'OK', headers: {} }
}
installAuthInterceptor(request, auth)
const rbac = createRbacPlugin({
  pinia, auth, loadAccess: async () => (await request.get('/access')).data,
})
app.use(rbac)
const access = rbac.accessStore
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { render: () => null } },
    { path: '/items', component: { render: () => '受保护页面已进入' }, meta: { permission: 'test.item.read' } },
    { path: '/403', component: { render: () => '403：已拒绝访问' } },
  ],
})
installRbacGuard(router, { accessStore: access })
app.use(router)
const menus = computed(() => filterMenus([
  { title: '公共菜单' }, { title: '受保护菜单', permission: 'test.item.read' },
], access.hasPermission))
async function change(next: string) {
  scenario.value = next
  try { await access.reloadAccess() } catch { /* Display store error. */ }
}
void change('all')
</script>

<template>
  <main>
    <h1>RBAC Library 浏览器回归</h1>
    <p>仅使用测试 Provider 与模拟 Axios 响应，不连接真实认证或业务接口。</p>
    <button @click="change('all')">全部权限</button>
    <button @click="change('viewer')">只读权限</button>
    <button @click="change('none')">无权限</button>
    <button @click="change('error')">接口失败</button>
    <button @click="access.clearAccess()">清空权限</button>
    <button @click="rbac.logout()">Logout</button>
    <p>Token Header: {{ tokenSent }}</p>
    <p>Logout: {{ loggedOut }}</p>
    <p>loaded: {{ access.loaded }} / loading: {{ access.loading }}</p>
    <p role="alert">{{ access.error }}</p>
    <ul><li v-for="menu in menus" :key="menu.title">{{ menu.title }}</li></ul>
    <button v-permission="'test.item.approve'">受权限控制的审批按钮</button>
    <button v-permission="['test.item.read']">非法数组按钮</button>
    <p><RouterLink to="/">公共页面</RouterLink> · <RouterLink to="/items">访问受保护页面</RouterLink></p>
    <RouterView />
  </main>
</template>
