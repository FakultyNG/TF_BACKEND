import { Module } from "@nestjs/common";
import { LyncClient } from "./lync.client";
import { LyncService, MockLyncProvider } from "./lync.service";

@Module({
  providers: [LyncClient, LyncService, MockLyncProvider],
  exports: [LyncClient, LyncService, MockLyncProvider]
})
export class LyncModule {}
