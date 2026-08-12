export class AppError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ValidationError extends AppError {
  constructor(message: string) { super(message, 400, 'VALIDATION_ERROR') }
}

export class InvalidCredentialsError extends AppError {
  constructor() { super('Invalid email or password', 401, 'INVALID_CREDENTIALS') }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication is required') { super(message, 401, 'UNAUTHORIZED') }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this operation') { super(message, 403, 'FORBIDDEN') }
}

export class NotFoundError extends AppError {
  constructor(message: string) { super(message, 404, 'NOT_FOUND') }
}

export class ConflictError extends AppError {
  constructor(message: string) { super(message, 409, 'CONFLICT') }
}

export class RefreshTokenReuseError extends AppError {
  constructor() { super('Refresh token reuse detected', 401, 'REFRESH_TOKEN_REUSE') }
}
