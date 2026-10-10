import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
import { Authenticated } from "../auth/access-posture.decorator.js";
import { FoundationObservabilityProofService } from "./foundation-observability-proof.service.js";

@Controller()
export class FoundationObservabilityProofController {
  constructor(private readonly proof: FoundationObservabilityProofService) {}

  @Authenticated()
  @Implement(contract.foundationObservability.proof)
  queueProof() {
    return implement(contract.foundationObservability.proof).handler(() =>
      this.proof.queueProof(),
    );
  }
}
