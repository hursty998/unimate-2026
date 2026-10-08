import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
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
}
