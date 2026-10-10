import { Controller, Get, Res } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
import type { FastifyReply } from "fastify";
import { Public } from "../auth/access-posture.decorator.js";
import { SystemService } from "./system.service.js";

export function createSystemHealthProcedure(systemService: SystemService) {
  return implement(contract.system.health).handler(() =>
    systemService.health(),
  );
}

@Controller()
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Public()
  @Implement(contract.system.health)
  health() {
    return createSystemHealthProcedure(this.systemService);
  }

  @Public()
  @Get("/v1/system/readiness")
  async readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    const ready = await this.systemService.readiness();
    reply.status(ready ? 200 : 503);

    return { status: ready ? "ready" : "not_ready" };
  }
}
