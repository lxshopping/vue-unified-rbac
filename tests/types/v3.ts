import { createDjangoLocalProvider, createHostLocalProvider, createRbacPlugin } from '@scotec/vue-unified-rbac'
import type { AuthSource, LocalAuthProvider, LocalLoginCredentials, DjangoLocalProviderOptions, HostLocalProviderOptions, RbacAuthOptions } from '@scotec/vue-unified-rbac'
const source: AuthSource = null
const config: DjangoLocalProviderOptions = { endpoints: { csrf: '/csrf', login: '/login', logout: '/logout' }, withCredentials: true }
const local: LocalAuthProvider<LocalLoginCredentials> = createDjangoLocalProvider(config)
const auth: RbacAuthOptions = { mode: 'local', localProvider: local }
const plugin = createRbacPlugin({ auth })
const hostOptions: HostLocalProviderOptions<{ otp: string }> = { async login(value) { void value.otp }, async logout() {} }
const host = createRbacPlugin({ auth: { mode: 'local', localProvider: createHostLocalProvider(hostOptions) } })
void plugin.auth.loginLocal({ username: 'user', password: 'example-only' })
void host.auth.loginLocal({ otp: 'example-only' })
void source
