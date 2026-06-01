import { HttpException, HttpStatus } from "@nestjs/common";

export class ApiException extends HttpException {
  constructor(
    message: string,
    public readonly code: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    public readonly details?: unknown
  ) {
    super({ message, code, details }, status);
  }
}
