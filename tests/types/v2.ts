import {
  createRbacPlugin, createHybridAuthManager, createKeycloakProvider,
  createRbacAdminApi, createRbacAdminPlugin, createRbacAdminRoutes,
  createRbacAdminMenu, RoleListView, RolePermissionMatrixView, MyAccessView,
  type AuthMode, type AuthSource, type RbacAdminPermissions, type AccessResult,
} from '@scotec/vue-unified-rbac'
import { createPinia } from 'pinia'
import axios from 'axios'

const request = axios.create()
const mode: AuthMode = 'hybrid'
const source: AuthSource = 'local'
const auth = createHybridAuthManager({ mode,
  sso: createKeycloakProvider({ url: 'https://sso.example.test', realm: 'host', clientId: 'host' }),
})
const rbac = createRbacPlugin({ pinia: createPinia(), auth,
  loadAccess: async () => (await request.get<AccessResult>('/api/rbac/me')).data,
})
rbac.auth.setAuthSource(source)
void rbac.accessStore.loadAccess
const permissions: RbacAdminPermissions = { roleView: 'host.view', roleManage: 'host.manage', meView: 'host.me' }
const api = createRbacAdminApi(request, { endpoints: {
  roles: '/configured/roles', permissions: '/configured/permissions',
  rolePermissions: code => '/configured/roles/' + encodeURIComponent(code),
} })
createRbacAdminPlugin({ api, permissions })
createRbacAdminRoutes({ permissions })
createRbacAdminMenu({ permissions })
void [RoleListView, RolePermissionMatrixView, MyAccessView]
