import { Body, Controller, Get, Param, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { CreateSupportTicketDto } from "./dto/create-support-ticket.dto";
import { ReplySupportTicketDto } from "./dto/reply-support-ticket.dto";
import { SupportTicketQueryDto } from "./dto/support-ticket-query.dto";
import { SupportService } from "./support.service";

@ApiTags("Support")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("support/tickets")
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  async create(@CurrentUser() user: { sub: string }, @Body() dto: CreateSupportTicketDto) {
    const data = await this.supportService.createTicket(user.sub, dto);
    return success("Support ticket created successfully", data);
  }

  @Post("attachments/upload")
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
    @CurrentUser() user: { sub: string },
    @UploadedFile() file: { originalname: string; mimetype: string; size: number; buffer: Buffer }
  ) {
    const data = await this.supportService.uploadAttachment(user.sub, file);
    return success("Support attachment uploaded successfully", data);
  }

  @Get()
  async list(@CurrentUser() user: { sub: string }, @Query() query: SupportTicketQueryDto) {
    const data = await this.supportService.listUserTickets(user.sub, query);
    return success("Support tickets fetched successfully", data);
  }

  @Get(":ticketId")
  async details(@CurrentUser() user: { sub: string }, @Param("ticketId") ticketId: string) {
    const data = await this.supportService.getUserTicket(user.sub, ticketId);
    return success("Support ticket details fetched successfully", data);
  }

  @Post(":ticketId/reply")
  async reply(@CurrentUser() user: { sub: string }, @Param("ticketId") ticketId: string, @Body() dto: ReplySupportTicketDto) {
    const data = await this.supportService.replyUser(user.sub, ticketId, dto);
    return success("Reply sent successfully", data);
  }

  @Post(":ticketId/close")
  async close(@CurrentUser() user: { sub: string }, @Param("ticketId") ticketId: string) {
    const data = await this.supportService.closeUserTicket(user.sub, ticketId);
    return success("Ticket closed successfully", data);
  }
}
