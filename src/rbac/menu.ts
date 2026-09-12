import type { StaticMenuItem } from '@/config/menu'

export function filterMenus(
  menus: readonly StaticMenuItem[],
  hasPermission: (permission: string) => boolean,
): StaticMenuItem[] {
  return menus.flatMap((menu) => {
    // 缺省 permission 才是公共菜单；显式传入空值或非法类型时拒绝显示。
    if (
      'permission' in menu &&
      (typeof menu.permission !== 'string' || !hasPermission(menu.permission))
    ) {
      return []
    }

    if (menu.children) {
      const children = filterMenus(menu.children, hasPermission)
      return children.length ? [{ ...menu, children }] : []
    }

    return [{ ...menu }]
  })
}
