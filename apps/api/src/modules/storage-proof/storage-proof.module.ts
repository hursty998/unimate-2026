import { Module } from "@nestjs/common";
import {
  PrismaStorageProofRepository,
  STORAGE_PROOF_REPOSITORY,
} from "./storage-proof.repository.js";
import { StorageProofController } from "./storage-proof.controller.js";
import { StorageProofService } from "./storage-proof.service.js";

@Module({
  controllers: [StorageProofController],
  providers: [
    PrismaStorageProofRepository,
    {
      provide: STORAGE_PROOF_REPOSITORY,
      useExisting: PrismaStorageProofRepository,
    },
    StorageProofService,
  ],
})
export class StorageProofModule {}
