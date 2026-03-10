export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "Validation failed",
    public details: Record<string, string[]> = {}
  ) {
    super(message, 400);
  }
}

export class APIError extends AppError {
  constructor(message = "Internal server error") {
    super(message, 500);
  }
}
