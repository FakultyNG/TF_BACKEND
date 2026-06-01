import { ArgumentsHost } from "@nestjs/common";
import { ApiExceptionFilter } from "../src/common/filters/api-exception.filter";

describe("ApiExceptionFilter", () => {
  it("maps oversized request body parser errors to a standard 413 response", () => {
    const json = jest.fn();
    const response = {
      status: jest.fn().mockReturnThis(),
      json
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response
      })
    } as unknown as ArgumentsHost;
    const error = Object.assign(new Error("request entity too large"), {
      status: 413,
      type: "entity.too.large"
    });

    new ApiExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: "Request body is too large",
      error: {
        code: "REQUEST_BODY_TOO_LARGE"
      }
    });
  });
});
