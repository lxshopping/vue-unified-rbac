import { filterMenus } from '@scotec/vue-unified-rbac'

// All-public menus need no RBAC-specific fields; preserve consumer fields.
const publicMenus = filterMenus([{ title: 'Home', path: '/' }], () => false)
const title: string = publicMenus[0].title

interface HostMenu {
  title: string
  icon?: string
  permission?: string
  children?: HostMenu[]
}
const menus: HostMenu[] = [{ title, children: [{ title: 'Nested' }] }]
const filtered: HostMenu[] = filterMenus(menus, () => true)
void filtered
