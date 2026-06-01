import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CreateNotificationDto } from "../notifications/dto/create-notification.dto";
import { NotificationQueryDto } from "../notifications/dto/notification-query.dto";
import { SendNotificationDto } from "../notifications/dto/send-notification.dto";
import { NotificationsService } from "../notifications/notifications.service";

@ApiTags("Admin Notifications")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
@Controller("admin/notifications")
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post()
  async create(@CurrentUser() admin: { sub: string }, @Body() dto: CreateNotificationDto) {
    const data = await this.notificationsService.createAdmin(admin.sub, dto);
    return success("Notification created successfully", data);
  }

  @Get()
  async list(@Query() query: NotificationQueryDto) {
    const data = await this.notificationsService.listAdmin(query);
    return success("Notifications fetched successfully", data);
  }

  @Get(":notificationId")
  async details(@Param("notificationId") notificationId: string) {
    const data = await this.notificationsService.getAdmin(notificationId);
    return success("Notification fetched successfully", data);
  }

  @Patch(":notificationId")
  async update(@CurrentUser() admin: { sub: string }, @Param("notificationId") notificationId: string, @Body() dto: CreateNotificationDto) {
    const data = await this.notificationsService.updateAdmin(admin.sub, notificationId, dto);
    return success("Notification updated successfully", data);
  }

  @Post(":notificationId/send")
  async send(@CurrentUser() admin: { sub: string }, @Param("notificationId") notificationId: string, @Body() dto: SendNotificationDto) {
    const data = await this.notificationsService.sendAdmin(admin.sub, notificationId, dto);
    return success("Notification sent successfully", data);
  }

  @Post(":notificationId/disable")
  async disable(@CurrentUser() admin: { sub: string }, @Param("notificationId") notificationId: string) {
    const data = await this.notificationsService.disableAdmin(admin.sub, notificationId);
    return success("Notification disabled successfully", data);
  }

  @Delete(":notificationId")
  async delete(@CurrentUser() admin: { sub: string }, @Param("notificationId") notificationId: string) {
    const data = await this.notificationsService.deleteDraft(admin.sub, notificationId);
    return success("Notification deleted successfully", data);
  }
}
