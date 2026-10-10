import { Module } from "@nestjs/common";
import { SystemController } from "./system.controller.js";
import {
  PrismaSystemDatabaseProbe,
  SYSTEM_DATABASE_PROBE,
  SystemService,
} from "./system.service.js";

@Module({
  controllers: [SystemController],
  providers: [
    SystemService,
    PrismaSystemDatabaseProbe,
    {
      provide: SYSTEM_DATABASE_PROBE,
      useExisting: PrismaSystemDatabaseProbe,
    },
  ],
})
export class SystemModule {}
