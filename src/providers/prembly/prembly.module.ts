import { Module } from "@nestjs/common";
import { PremblyKycProvider } from "./prembly.service";

@Module({
  providers: [PremblyKycProvider],
  exports: [PremblyKycProvider]
})
export class PremblyModule {}
