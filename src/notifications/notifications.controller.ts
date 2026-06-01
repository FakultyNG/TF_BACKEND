import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { NotificationQueryDto } from "./dto/notification-query.dto";
import { RegisterDeviceTokenDto } from "./dto/register-device-token.dto";
import { RemoveDeviceTokenDto } from "./dto/remove-device-token.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("Notifications")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: { sub: string }, @Query() query: NotificationQueryDto) {
    const data = await this.notificationsService.listUserNotifications(user.sub, query);
    return success("Notifications fetched successfully", data);
  }

  @Post("device-token/register")
  async registerDeviceToken(@CurrentUser() user: { sub: string }, @Body() dto: RegisterDeviceTokenDto) {
    const data = await this.notificationsService.registerDeviceToken(user.sub, dto);
    return success("Device token registered successfully", data);
  }

  @Post("device-token/remove")
  async removeDeviceToken(@CurrentUser() user: { sub: string }, @Body() dto: RemoveDeviceTokenDto) {
    const data = await this.notificationsService.removeDeviceToken(user.sub, dto.deviceId);
    return success("Device token removed successfully", data);
  }

  @Patch(":notificationId/read")
  async read(@CurrentUser() user: { sub: string }, @Param("notificationId") notificationId: string) {
    const data = await this.notificationsService.markRead(user.sub, notificationId);
    return success("Notification marked as read successfully", data);
  }

  @Patch("read-all")
  async readAll(@CurrentUser() user: { sub: string }) {
    const data = await this.notificationsService.markAllRead(user.sub);
    return success("All notifications marked as read successfully", data);
  }

  @Get("categories")
  async categories() {
    return success("Notification categories fetched successfully", this.notificationsService.categories());
  }

  @Get("priorities")
  async priorities() {
    return success("Notification priorities fetched successfully", this.notificationsService.priorities());
  }

  @Get("types")
  async types() {
    return success("Notification types fetched successfully", this.notificationsService.types());
  }
}
