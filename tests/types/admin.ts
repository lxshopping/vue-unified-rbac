import type { RbacAdminApi, RbacAdminApiOptions, RbacAdminPermissions, AccessResult } from '../../src/lib'
import { createRbacAdminApi, createRbacAdminPlugin, createRbacAdminRoutes } from '../../src/lib'
import axios from 'axios'

// Existing hosts and custom read-only adapters need no new required fields.
const oldPermissions: RbacAdminPermissions = { roleView: 'host.role.read', rolePermissionUpdate: 'host.role.write' }
const minimalPermissions: RbacAdminPermissions = { roleView: 'rbac.role.view' }
const oldApi: RbacAdminApi = {
  async listRoles() { return [{ code: 'legacy' }] },
  async listPermissions() { return [] },
  async getRolePermissions() { return [] },
  async updateRolePermissions() {},
  async getMyAccess() { return { roles: [], permissions: [] } },
}
createRbacAdminPlugin({ api: oldApi, permissions: oldPermissions })
createRbacAdminRoutes({ permissions: minimalPermissions })
const options: RbacAdminApiOptions = { endpoints: { me: '/custom/me' }, basePath: '/custom/admin' }
const api = createRbacAdminApi(axios.create(), options)
api.updateRole?.(1, { name: 'Updated', active: true })
// @ts-expect-error Role code cannot be changed after creation.
api.updateRole?.(1, { code: 'renamed' })
const me: AccessResult = { roles: [], permissions: [], role_source: 'keycloak' }
void me
