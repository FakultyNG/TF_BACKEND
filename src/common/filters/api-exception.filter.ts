import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from "@nestjs/common";
import { Response } from "express";
import { ApiErrorBody } from "../api-response";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const rawException = exception as { message?: string; stack?: string; status?: number; type?: string };
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : typeof rawException.status === "number"
          ? rawException.status
          : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    let message = "Something went wrong";
    let code = "INTERNAL_SERVER_ERROR";
    let details: unknown;

    if (typeof exceptionResponse === "string") {
      message = exceptionResponse;
      code = this.codeForStatus(status);
    } else if (exceptionResponse && typeof exceptionResponse === "object") {
      const body = exceptionResponse as Record<string, unknown>;
      message =
        typeof body.message === "string"
          ? body.message
          : Array.isArray(body.message)
            ? "Validation failed"
            : message;
      code = typeof body.code === "string" ? body.code : this.codeForStatus(status);
      details = body.details ?? (Array.isArray(body.message) ? body.message : undefined);
    }

    if (!(exception instanceof HttpException)) {
      if (rawException.type === "entity.too.large" || status === HttpStatus.PAYLOAD_TOO_LARGE) {
        message = "Request body is too large";
        code = "REQUEST_BODY_TOO_LARGE";
      } else {
        this.logger.error(rawException.message ?? "Unhandled exception", rawException.stack);
      }
    }

    const payload: ApiErrorBody = {
      success: false,
      message,
      error: details ? { code, details } : { code }
    };
    response.status(status).json(payload);
  }

  private codeForStatus(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "VALIDATION_ERROR";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return "REQUEST_BODY_TOO_LARGE";
      default:
        return status >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED";
    }
  }
}
