export const checkoutBody = {
  type:                 'object',
  required:             ['planSlug', 'billingCycle'],
  additionalProperties: false,
  properties: {
    planSlug:     { type: 'string', minLength: 1 },
    billingCycle: { type: 'string', enum: ['monthly', 'yearly'] },
  },
} as const

const redirectUrlResponse = {
  200: {
    type: 'object',
    properties: {
      url: { type: 'string', format: 'uri' },
    },
  },
} as const

export const checkoutResponse  = redirectUrlResponse
export const portalResponse    = redirectUrlResponse

const planShape = {
  type: 'object',
  properties: {
    id:                   { type: 'string' },
    name:                 { type: 'string' },
    slug:                 { type: 'string' },
    tier:                 { type: 'integer' },
    priceMonthlycents:    { type: ['integer', 'null'] },
    priceYearlyCents:     { type: ['integer', 'null'] },
    limits:               { type: 'object' },
    features:             { type: 'object' },
  },
}

export const planListResponse = {
  200: {
    type: 'object',
    properties: {
      plans: { type: 'array', items: planShape },
    },
  },
} as const

export const subscriptionResponse = {
  200: {
    type: 'object',
    properties: {
      subscription: {
        type: ['object', 'null'],
        properties: {
          id:                   { type: 'string' },
          status:               { type: 'string' },
          billingCycle:         { type: 'string' },
          trialEndsAt:          { type: ['string', 'null'], format: 'date-time' },
          currentPeriodEnd:     { type: ['string', 'null'], format: 'date-time' },
          cancelAt:             { type: ['string', 'null'], format: 'date-time' },
          plan:                 planShape,
        },
      },
    },
  },
} as const
