import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OtpModule } from "../otp/otp.module";
import { UsersModule } from "../users/users.module";
import { PasscodeController } from "./passcode.controller";
import { PasscodeService } from "./passcode.service";

@Module({
  imports: [AuthModule, OtpModule, UsersModule],
  controllers: [PasscodeController],
  providers: [PasscodeService]
})
export class PasscodeModule {}
