import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { AdminPermissionsGuard } from "../auth/guards/admin-permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AdminPermissions } from "../common/decorators/admin-permissions.decorator";
import { ReplySupportTicketDto } from "../support/dto/reply-support-ticket.dto";
import { SupportService } from "../support/support.service";
import { AdminSupportTicketQueryDto } from "./dto/admin-support-ticket-query.dto";
import { AssignSupportTicketDto } from "./dto/assign-support-ticket.dto";

@ApiTags("Admin Support")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
@AdminPermissions("support.view")
@Controller("admin/support/tickets")
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @Get("conversations/list")
  async conversations(@Query("search") search?: string) {
    const data = await this.supportService.listAdminConversations(search?.trim() || undefined);
    return success("Support conversations fetched successfully", data);
  }

  @Get("conversations/:userId")
  async conversation(@Param("userId") userId: string) {
    const data = await this.supportService.getAdminConversation(userId);
    return success("Support conversation fetched successfully", data);
  }

  @AdminPermissions("support.reply")
  @Post("conversations/:userId/messages")
  async messageUser(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string, @Body() dto: ReplySupportTicketDto) {
    const data = await this.supportService.adminMessageUser(admin.sub, userId, dto);
    return success("Support message sent successfully", data);
  }

  @Get()
  async list(@Query() query: AdminSupportTicketQueryDto) {
    const data = await this.supportService.listAdminTickets(query);
    return success("Support tickets fetched successfully", data);
  }

  @Get(":ticketId")
  async details(@Param("ticketId") ticketId: string) {
    const data = await this.supportService.getAdminTicket(ticketId);
    return success("Support ticket details fetched successfully", data);
  }

  @Post(":ticketId/reply")
  @AdminPermissions("support.reply")
  async reply(@CurrentUser() admin: { sub: string }, @Param("ticketId") ticketId: string, @Body() dto: ReplySupportTicketDto) {
    const data = await this.supportService.adminReply(admin.sub, ticketId, dto);
    return success("Support reply sent successfully", data);
  }

  @Post("attachments/upload")
  @AdminPermissions("support.reply")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        file: { type: "string", format: "binary" }
      },
      required: ["file"]
    }
  })
  async uploadAttachment(
    @CurrentUser() admin: { sub: string },
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    const data = await this.supportService.uploadAttachment(admin.sub, file);
    return success("Support attachment uploaded successfully", data);
  }

  @Post(":ticketId/assign")
  async assign(@CurrentUser() admin: { sub: string }, @Param("ticketId") ticketId: string, @Body() dto: AssignSupportTicketDto) {
    const data = await this.supportService.assign(admin.sub, ticketId, dto.assignedAdminId);
    return success("Support ticket assigned successfully", data);
  }

  @Post(":ticketId/close")
  async close(@CurrentUser() admin: { sub: string }, @Param("ticketId") ticketId: string) {
    const data = await this.supportService.adminClose(admin.sub, ticketId);
    return success("Support ticket closed successfully", data);
  }

  @Post(":ticketId/reopen")
  async reopen(@CurrentUser() admin: { sub: string }, @Param("ticketId") ticketId: string) {
    const data = await this.supportService.reopen(admin.sub, ticketId);
    return success("Support ticket reopened successfully", data);
  }
}
