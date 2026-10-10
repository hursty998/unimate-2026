import { Module } from "@nestjs/common";
import { FoundationObservabilityProofController } from "./foundation-observability-proof.controller.js";
import { FoundationObservabilityProofService } from "./foundation-observability-proof.service.js";

@Module({
  controllers: [FoundationObservabilityProofController],
  providers: [FoundationObservabilityProofService],
})
export class FoundationObservabilityProofModule {}
