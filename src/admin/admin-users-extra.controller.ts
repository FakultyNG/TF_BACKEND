import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { BiometricsService } from "../biometrics/biometrics.service";
import { ProfileService } from "../profile/profile.service";
import { AdminUserOperationalUpdateDto } from "./dto/admin-user-operational-update.dto";

@ApiTags("Admin Users")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard)
@Controller("admin/users")
export class AdminUsersExtraController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly biometricsService: BiometricsService
  ) {}

  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
  @Get(":userId/profile")
  async profile(@Param("userId") userId: string) {
    const data = await this.profileService.getProfile(userId);
    return success("User profile fetched successfully", data);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Patch(":userId/profile/operational")
  async updateOperational(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string, @Body() dto: AdminUserOperationalUpdateDto) {
    const data = await this.profileService.adminUpdateOperationalFields(admin.sub, userId, dto);
    return success("User profile operational fields updated successfully", data);
  }

  @Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Get(":userId/trusted-devices")
  async devices(@Param("userId") userId: string) {
    const data = await this.biometricsService.listUserDevices(userId);
    return success("Trusted devices fetched successfully", data);
  }

  @Roles(UserRole.ADMIN, UserRole.COMPLIANCE, UserRole.SUPER_ADMIN)
  @Post(":userId/trusted-devices/:deviceId/revoke")
  async revokeDevice(@CurrentUser() admin: { sub: string }, @Param("userId") userId: string, @Param("deviceId") deviceId: string) {
    const data = await this.biometricsService.revokeDevice(admin.sub, userId, deviceId);
    return success("Trusted device revoked successfully", data);
  }
}
