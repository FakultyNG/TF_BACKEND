import { Module } from "@nestjs/common";
import { ProvidersModule } from "../providers/providers.module";
import { OtpController } from "./otp.controller";
import { OtpService } from "./otp.service";

@Module({
  imports: [ProvidersModule],
  controllers: [OtpController],
  providers: [OtpService],
  exports: [OtpService]
})
export class OtpModule {}
