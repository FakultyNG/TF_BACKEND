import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ProfileService } from "./profile.service";

@ApiTags("Profile")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async get(@CurrentUser() user: { sub: string }) {
    const data = await this.profileService.getProfile(user.sub);
    return success("Profile fetched successfully", data);
  }

  @Patch()
  async update(@CurrentUser() user: { sub: string }, @Body() dto: UpdateProfileDto) {
    const data = await this.profileService.updateProfile(user.sub, dto);
    return success("Profile updated successfully", data);
  }
}
