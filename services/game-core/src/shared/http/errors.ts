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

  static unauthorized(detail = 'Bạn cần đăng nhập để tiếp tục.'): AppError {
    return new AppError(401, 'unauthorized', 'Chưa đăng nhập', detail);
  }

  static forbidden(detail = 'Bạn không có quyền thực hiện thao tác này.'): AppError {
    return new AppError(403, 'forbidden', 'Không có quyền', detail);
  }

  static notFound(resource: string): AppError {
    return new AppError(404, 'not_found', 'Không tìm thấy', `Không tìm thấy ${resource}.`);
  }

  static conflict(code: string, detail: string): AppError {
    return new AppError(409, code, 'Không thể thực hiện', detail);
  }

  static badRequest(detail: string): AppError {
    return new AppError(400, 'bad_request', 'Yêu cầu không hợp lệ', detail);
  }

  static unprocessable(detail: string): AppError {
    return new AppError(422, 'unprocessable_entity', 'Dữ liệu không hợp lệ', detail);
  }
}
