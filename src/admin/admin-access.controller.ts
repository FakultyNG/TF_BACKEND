import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { AdminJwtAuthGuard } from "../auth/guards/admin-jwt-auth.guard";
import { AdminPermissionsGuard } from "../auth/guards/admin-permissions.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { success } from "../common/api-response";
import { AdminPermissions } from "../common/decorators/admin-permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { UpdateAdminDto } from "./dto/update-admin.dto";
import { AdminService } from "./admin.service";

@ApiTags("Admin Access")
@ApiBearerAuth()
@UseGuards(AdminJwtAuthGuard, RolesGuard, AdminPermissionsGuard)
@Roles(UserRole.ADMIN, UserRole.SUPPORT, UserRole.COMPLIANCE, UserRole.FINANCE, UserRole.SUPER_ADMIN)
@Controller("admin")
export class AdminAccessController {
  constructor(private readonly adminService: AdminService) {}

  @Get("auth/me")
  async me(@CurrentUser() admin: { sub: string }) {
    return success("Admin profile fetched successfully", await this.adminService.me(admin.sub));
  }

  @AdminPermissions("dashboard.view")
  @Get("dashboard")
  async dashboard() {
    return success("Dashboard fetched successfully", await this.adminService.dashboard());
  }

  @Roles(UserRole.SUPER_ADMIN)
  @AdminPermissions("admins.manage")
  @Get("admins")
  async admins() {
    return success("Admin accounts fetched successfully", await this.adminService.listAdmins());
  }

  @Roles(UserRole.SUPER_ADMIN)
  @AdminPermissions("admins.manage")
  @Post("admins")
  async create(@CurrentUser() admin: { sub: string }, @Body() dto: CreateAdminDto) {
    return success("Admin account created successfully", await this.adminService.createAdmin(admin.sub, dto));
  }

  @Roles(UserRole.SUPER_ADMIN)
  @AdminPermissions("admins.manage")
  @Patch("admins/:adminId")
  async update(@CurrentUser() admin: { sub: string }, @Param("adminId") adminId: string, @Body() dto: UpdateAdminDto) {
    return success("Admin account updated successfully", await this.adminService.updateAdmin(admin.sub, adminId, dto));
  }
}
