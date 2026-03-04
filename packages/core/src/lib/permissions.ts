export function buildPermissions(role: string | null): string[] {
  switch (role) {
    case 'owner': return [
      'tenant:delete', 'tenant:settings',
      'billing:read', 'billing:write',
      'members:read', 'members:write', 'members:remove',
      'api-keys:read', 'api-keys:write',
      'webhooks:read', 'webhooks:write',
    ]
    case 'admin': return [
      'billing:read',
      'members:read', 'members:write',
      'api-keys:read', 'api-keys:write',
      'webhooks:read', 'webhooks:write',
    ]
    case 'member': return [
      'members:read',
      'api-keys:read',
    ]
    default: return []
  }
}
