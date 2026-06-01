import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { success } from "../common/api-response";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  @Get()
  @ApiOkResponse({
    description: "Service health check",
    schema: {
      example: {
        success: true,
        message: "Service is healthy",
        data: {
          status: "ok"
        }
      }
    }
  })
  check() {
    return success("Service is healthy", {
      status: "ok"
    });
  }
}
