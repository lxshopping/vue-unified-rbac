<script setup lang="ts">
import { ref } from 'vue'
import { useRbac } from '@scotec/vue-unified-rbac'
const rbac = useRbac()
const busy = ref(false)
const error = ref('')
async function run(action: () => Promise<unknown>) {
  busy.value = true
  error.value = ''
  try { await action() } catch { error.value = '请求失败，请检查凭据、后端连接及 CSRF 配置后重试。' }
  finally { busy.value = false }
}
async function loginLocal(event: Event) {
  const form = event.currentTarget as HTMLFormElement
  const data = new FormData(form)
  const credentials = { username: String(data.get('username') ?? ''), password: String(data.get('password') ?? '') }
  form.reset()
  await run(() => rbac.auth.loginLocal(credentials))
}
</script>
<template>
  <main class="content">
    <h1>V3 Authentication Demo · {{ rbac.auth.mode }}</h1>
    <p>当前来源：{{ rbac.auth.source ?? '未登录' }} · 用户：{{ rbac.access.username || '—' }}</p>
    <form v-if="rbac.auth.mode !== 'sso'" @submit.prevent="loginLocal">
      <label>Username <input name="username" autocomplete="username" required :disabled="busy" /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required :disabled="busy" /></label>
      <button :disabled="busy">Local Login</button>
    </form>
    <div class="actions">
      <button v-if="rbac.auth.mode !== 'local'" :disabled="busy" @click="run(() => rbac.auth.loginSso())">SSO Login</button>
      <button :disabled="busy || !rbac.auth.source" @click="run(() => rbac.logout())">Logout</button>
      <button :disabled="busy || !rbac.auth.source" @click="run(() => rbac.access.reloadAccess())">刷新 /me</button>
    </div>
    <p v-if="error || rbac.auth.error || rbac.access.error" role="alert">{{ error || rbac.auth.error || rbac.access.error }}</p>
    <p v-if="busy || rbac.access.loading" role="status">正在请求…</p>
    <h2>Roles</h2><pre>{{ rbac.access.roles }}</pre>
    <h2>Permissions · GET /api/rbac/me</h2><pre>{{ rbac.access.permissions }}</pre>
    <button v-permission="'demo.order.view'">demo.order.view 按钮</button>
  </main>
</template>
