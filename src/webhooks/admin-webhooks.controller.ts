import { Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminWebhooksService } from "./admin-webhooks.service";
import { WebhookLogQueryDto } from "./dto/webhook-log-query.dto";

@ApiTags("Admin Webhooks")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller("admin/webhooks")
export class AdminWebhooksController {
  constructor(private readonly service: AdminWebhooksService) {}

  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("logs")
  async logs(@Query() query: WebhookLogQueryDto) {
    const data = await this.service.list(query);
    return success("Webhook logs fetched successfully", data);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("logs/:webhookLogId")
  async log(@CurrentUser() admin: { role: UserRole }, @Param("webhookLogId") webhookLogId: string) {
    const data = await this.service.get(webhookLogId, admin.role);
    return success("Webhook log fetched successfully", data);
  }

  @Roles(UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Post("logs/:webhookLogId/retry")
  async retry(@CurrentUser() admin: { sub: string }, @Param("webhookLogId") webhookLogId: string) {
    const data = await this.service.retry(admin.sub, webhookLogId);
    return success("Webhook retry handled successfully", data);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get("summary")
  async summary() {
    const data = await this.service.summary();
    return success("Webhook summary fetched successfully", data);
  }
}
