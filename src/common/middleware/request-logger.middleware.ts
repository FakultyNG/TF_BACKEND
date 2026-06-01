import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - startedAt;
      console.log(
        JSON.stringify({
          method: req.method,
          path: req.originalUrl,
          statusCode: res.statusCode,
          durationMs: duration
        })
      );
    });
    next();
  }
}
