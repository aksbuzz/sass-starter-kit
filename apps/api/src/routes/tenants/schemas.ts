export const createTenantBody = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    slug: { type: 'string', minLength: 1, maxLength: 50, pattern: '^[a-z0-9][a-z0-9-]*[a-z0-9]$' },
  },
} as const

export const updateTenantBody = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    name:     { type: 'string', minLength: 1, maxLength: 100 },
    settings: { type: 'object', maxProperties: 30 },
  },
} as const

export const inviteMemberBody = {
  type: 'object',
  required: ['email', 'role'],
  additionalProperties: false,
  properties: {
    email: { type: 'string', format: 'email' },
    role:  { type: 'string', enum: ['owner', 'admin', 'member'] },
  },
} as const

export const updateRoleBody = {
  type: 'object',
  required: ['role'],
  additionalProperties: false,
  properties: {
    role: { type: 'string', enum: ['owner', 'admin', 'member'] },
  },
} as const

export const paginationQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit:  { type: 'integer', minimum: 1,  maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const

const tenantShape = {
  type: 'object',
  properties: {
    id:            { type: 'string' },
    slug:          { type: 'string' },
    name:          { type: 'string' },
    isolationMode: { type: 'string' },
    status:        { type: 'string' },
    settings:      { type: 'object' },
    createdAt:     { type: 'string', format: 'date-time' },
    updatedAt:     { type: 'string', format: 'date-time' },
  },
}

const membershipShape = {
  type: 'object',
  properties: {
    id:       { type: 'string' },
    role:     { type: 'string' },
    status:   { type: 'string' },
    joinedAt: { type: 'string', format: 'date-time' },
  },
}

const planShape = {
  type: 'object',
  properties: {
    id:      { type: 'string' },
    name:    { type: 'string' },
    slug:    { type: 'string' },
    tier:    { type: 'integer' },
    limits:  { type: 'object' },
    features:{ type: 'object' },
  },
}

export const workspaceContextResponse = {
  200: {
    type: 'object',
    properties: {
      tenant:      tenantShape,
      membership:  membershipShape,
      memberCount: { type: 'integer' },
      subscription: {
        type: ['object', 'null'],
        properties: {
          status:             { type: 'string' },
          billingCycle:       { type: 'string' },
          trialEndsAt:        { type: ['string', 'null'], format: 'date-time' },
          currentPeriodEnd:   { type: ['string', 'null'], format: 'date-time' },
          plan:               planShape,
        },
      },
      flags: { type: 'object' },
    },
  },
} as const

export const memberListResponse = {
  200: {
    type: 'object',
    properties: {
      members: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:       { type: 'string' },
            role:     { type: 'string' },
            status:   { type: 'string' },
            joinedAt: { type: 'string', format: 'date-time' },
            user: {
              type: 'object',
              properties: {
                id:        { type: 'string' },
                email:     { type: 'string' },
                name:      { type: ['string', 'null'] },
                avatarUrl: { type: ['string', 'null'] },
              },
            },
          },
        },
      },
    },
  },
} as const

export const invitationResponse = {
  201: {
    type: 'object',
    properties: {
      id:        { type: 'string' },
      email:     { type: 'string' },
      role:      { type: 'string' },
      expiresAt: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
} as const
