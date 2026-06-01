import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsString } from "class-validator";

export class AssignSupportTicketDto {
  @ApiProperty({ example: "admin_12345" })
  @IsString()
  @IsNotEmpty()
  assignedAdminId: string;
}
