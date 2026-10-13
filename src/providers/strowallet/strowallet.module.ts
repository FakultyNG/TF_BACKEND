import { Module } from "@nestjs/common";
import { StrowalletService } from "./strowallet.service";

@Module({
  providers: [StrowalletService],
  exports: [StrowalletService]
})
export class StrowalletModule {}
