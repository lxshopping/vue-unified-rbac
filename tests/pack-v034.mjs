import assert from 'node:assert/strict'
import { readFile, readdir, stat, lstat } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// Run after installing the tarball in a clean consumer; never import repository source.
if (!process.argv[2]) throw new Error('Pass the installed tarball package directory as the first argument.')
const packageRoot = path.resolve(process.argv[2])
assert.equal((await lstat(packageRoot)).isSymbolicLink(), false, 'Must verify an installed tarball, not a source link')
const metadata = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
assert.equal(metadata.name, '@scotec/vue-unified-rbac'); assert.equal(metadata.version, '0.3.4')
const lib = await import(pathToFileURL(path.join(packageRoot, metadata.main)).href)
for (const name of ['createRbacPlugin', 'useAccessStore', 'createRbacAdminApi', 'createRbacAdminPlugin', 'createRbacAdminRoutes', 'createRbacAdminMenu', 'installRbacGuard', 'filterMenus', 'RoleListView', 'RolePermissionMatrixView', 'LocalUserRolesView', 'MyAccessView', 'AuditLogView']) assert.ok(lib[name], name)
assert.equal(lib.createRbacAdminRoutes({ permissions: {} }).length, 4)
const routes = lib.createRbacAdminRoutes({ permissions: {}, includeAudit: true })
assert.equal(routes.length, 5)
for (const route of routes) assert.ok((await route.component()).default)
assert.equal(routes.at(-1).meta.permission, 'rbac.audit.view')
assert.ok((await stat(path.join(packageRoot, 'dist/style.css'))).size > 0)
assert.match(await readFile(path.join(packageRoot, 'dist/admin/api/types.d.ts'), 'utf8'), /interface AuditLogQuery/)
assert.ok(!(await readdir(packageRoot)).some(name => ['src', 'tests', 'node_modules', '.tmp'].includes(name)))
console.log('Installed 0.3.4 package: public exports, five lazy pages, old routes, declarations and CSS passed.')
