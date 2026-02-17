export class NotFoundError extends Error {
  readonly code       = 'NOT_FOUND'
  readonly statusCode = 404
  constructor(entity: string, identifier: string) {
    super(`${entity} not found: ${identifier}`)
    this.name = 'NotFoundError'
  }
}

export class ConflictError extends Error {
  readonly code       = 'CONFLICT'
  readonly statusCode = 409
  constructor(message: string) {
    super(message)
    this.name = 'ConflictError'
  }
}

export class ForbiddenError extends Error {
  readonly code       = 'FORBIDDEN'
  readonly statusCode = 403
  constructor(message = 'Insufficient permissions') {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export class PlanLimitError extends Error {
  readonly code       = 'PLAN_LIMIT_EXCEEDED'
  readonly statusCode = 402
  constructor(readonly limit: string, readonly current: number, readonly max: number) {
    super(`Plan limit reached for ${limit}: ${current}/${max}`)
    this.name = 'PlanLimitError'
  }
}
