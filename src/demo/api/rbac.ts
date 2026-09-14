import request from '@/api/request'
import type { AccessResult } from '@scotec/vue-unified-rbac'

export async function fetchMyAccess(): Promise<AccessResult> {
  const response = await request.get<AccessResult>('/rbac/me')
  // The library validates roles/permissions before accepting this response.
  return response.data
}
