import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { OtpModule } from "../otp/otp.module";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  imports: [JwtModule.register({}), UsersModule, OtpModule],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminJwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, AdminJwtAuthGuard, RolesGuard]
})
export class AuthModule {}
