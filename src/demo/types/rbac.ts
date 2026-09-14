export interface RoleItem {
  code: string
  name: string
  enabled: boolean
  source?: 'local' | 'sso'
}

export interface PermissionItem {
  code: string
  name: string
  enabled: boolean
  description?: string
}
