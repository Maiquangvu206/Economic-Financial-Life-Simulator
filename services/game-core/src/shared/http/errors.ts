export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
  ) {
    super(title);
    this.name = 'AppError';
  }

  static unauthorized(detail = 'Authentication required'): AppError {
    return new AppError(401, 'unauthorized', 'Unauthorized', detail);
  }

  static forbidden(detail = 'Insufficient permissions'): AppError {
    return new AppError(403, 'forbidden', 'Forbidden', detail);
  }

  static notFound(resource: string): AppError {
    return new AppError(404, 'not_found', 'Not found', `${resource} was not found`);
  }

  static conflict(code: string, detail: string): AppError {
    return new AppError(409, code, 'Conflict', detail);
  }

  static badRequest(detail: string): AppError {
    return new AppError(400, 'bad_request', 'Bad request', detail);
  }

  static unprocessable(detail: string): AppError {
    return new AppError(422, 'unprocessable_entity', 'Unprocessable entity', detail);
  }
}
