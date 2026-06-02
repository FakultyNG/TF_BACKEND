import { forwardRef, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { CashDropModule } from "../cash-drop/cash-drop.module";
import { OtpModule } from "../otp/otp.module";
import { ProvidersModule } from "../providers/providers.module";
import { UploadsModule } from "../uploads/uploads.module";
import { UsersModule } from "../users/users.module";
import { WalletModule } from "../wallet/wallet.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  imports: [
    JwtModule.register({}),
    UsersModule,
    OtpModule,
    ProvidersModule,
    forwardRef(() => UploadsModule),
    forwardRef(() => WalletModule),
    forwardRef(() => CashDropModule)
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, AdminJwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, AdminJwtAuthGuard, RolesGuard]
})
export class AuthModule {}
