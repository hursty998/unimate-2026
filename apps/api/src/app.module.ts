import { Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { SystemModule } from "./modules/system/system.module.js";

@Module({
  imports: [ORPCModule.forRoot({}), SystemModule],
})
export class AppModule {}
