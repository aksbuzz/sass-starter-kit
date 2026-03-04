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
