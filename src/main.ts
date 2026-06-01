import "reflect-metadata";
import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import * as cookieParser from "cookie-parser";
import { NextFunction, Request, Response, json, urlencoded } from "express";
import { AppModule } from "./app.module";
import { ApiErrorBody, success } from "./common/api-response";
import { ApiExceptionFilter } from "./common/filters/api-exception.filter";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const apiPrefix = config.get<string>("API_PREFIX", "api/v1");
  const jsonBodyLimit = config.get<string>("JSON_BODY_LIMIT", "10mb");

  app.use(json({ limit: jsonBodyLimit }));
  app.use(urlencoded({ extended: true, limit: jsonBodyLimit }));
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    const parserError = error as { status?: number; type?: string };
    if (parserError.type === "entity.too.large" || parserError.status === HttpStatus.PAYLOAD_TOO_LARGE) {
      const payload: ApiErrorBody = {
        success: false,
        message: "Request body is too large",
        error: { code: "REQUEST_BODY_TOO_LARGE" }
      };
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json(payload);
      return;
    }
    next(error);
  });
  app.setGlobalPrefix(apiPrefix);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>("CORS_ORIGIN", "*"),
    credentials: true
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  app.getHttpAdapter().getInstance().get("/", (_request: Request, response: Response) => {
    response.json(
      success("TF Backend API is running", {
        service: "tf-backend",
        docs: `/${apiPrefix}/docs`,
        health: `/${apiPrefix}/health`
      })
    );
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle("TF Backend API")
    .setDescription("TRANSFA mobile and admin backend APIs")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document);

  await app.listen(config.get<number>("PORT", 4000), "0.0.0.0");
}

bootstrap();
