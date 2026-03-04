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
