import { Module } from "@nestjs/common";
import { BytidKycProvider } from "./bytid.service";

@Module({
  providers: [BytidKycProvider],
  exports: [BytidKycProvider]
})
export class BytidModule {}
