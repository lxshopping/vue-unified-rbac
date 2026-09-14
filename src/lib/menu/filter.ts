export interface PermissionMenuItem {
  permission?: string
  children?: readonly PermissionMenuItem[]
}

export function filterMenus<T extends object>(
  menus: readonly (T & PermissionMenuItem)[],
  hasPermission: (permission: string) => boolean,
): T[] {
  return menus.flatMap((menu) => {
    // 缺省 permission 才是公共菜单；显式传入空值或非法类型时拒绝显示。
    if (
      'permission' in menu &&
      (typeof menu.permission !== 'string' || !menu.permission.trim() || !hasPermission(menu.permission))
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
