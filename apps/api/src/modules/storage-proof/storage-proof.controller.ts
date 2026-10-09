import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@unimate/contracts";
import { Authenticated } from "../auth/access-posture.decorator.js";
import {
  CurrentAuthenticatedPrincipal,
  type AuthenticatedPrincipal,
} from "../auth/authenticated-principal.js";
import { StorageProofService } from "./storage-proof.service.js";

@Controller()
export class StorageProofController {
  constructor(private readonly storageProof: StorageProofService) {}

  @Authenticated()
  @Implement(contract.storageProof.issueUpload)
  issueUpload(
    @CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return implement(contract.storageProof.issueUpload).handler(() =>
      this.storageProof.issueUpload(principal),
    );
  }

  @Authenticated()
  @Implement(contract.storageProof.completeUpload)
  completeUpload(
    @CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return implement(contract.storageProof.completeUpload).handler(
      ({ input }) => this.storageProof.completeUpload(principal, input.id),
    );
  }

  @Authenticated()
  @Implement(contract.storageProof.readPermission)
  createReadPermission(
    @CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal,
  ) {
    return implement(contract.storageProof.readPermission).handler(
      ({ input }) =>
        this.storageProof.createReadPermission(principal, input.id),
    );
  }

  @Authenticated()
  @Implement(contract.storageProof.delete)
  delete(@CurrentAuthenticatedPrincipal() principal: AuthenticatedPrincipal) {
    return implement(contract.storageProof.delete).handler(({ input }) =>
      this.storageProof.delete(principal, input.id),
    );
  }
}
