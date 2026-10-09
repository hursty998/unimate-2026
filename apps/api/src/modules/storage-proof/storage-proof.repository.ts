import { Injectable } from "@nestjs/common";
import { DatabaseClientService } from "../../infrastructure/database/database.module.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";

export type StorageProofRecord = {
  id: string;
  objectKey: string;
  creatorUserId: string;
  contentType: string;
  status: "PENDING" | "READY";
  sizeBytes: number | null;
  createdAt: Date;
  completedAt: Date | null;
};

export interface StorageProofRepository {
  resolveUserId(principal: AuthenticatedPrincipal): Promise<string | null>;
  createPending(input: {
    creatorUserId: string;
    objectKey: string;
    contentType: string;
  }): Promise<StorageProofRecord>;
  findOwned(
    id: string,
    creatorUserId: string,
  ): Promise<StorageProofRecord | null>;
  markReady(
    id: string,
    creatorUserId: string,
    sizeBytes: number,
  ): Promise<StorageProofRecord | null>;
  deletePending(id: string): Promise<void>;
  deleteOwned(id: string, creatorUserId: string): Promise<void>;
}

export const STORAGE_PROOF_REPOSITORY = Symbol("STORAGE_PROOF_REPOSITORY");

const storedObjectSelection = {
  id: true,
  objectKey: true,
  creatorUserId: true,
  contentType: true,
  status: true,
  sizeBytes: true,
  createdAt: true,
  completedAt: true,
} as const;

@Injectable()
export class PrismaStorageProofRepository implements StorageProofRepository {
  constructor(private readonly database: DatabaseClientService) {}

  async resolveUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string | null> {
    const identity = await this.database.client.authIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: principal.provider,
          providerSubject: principal.providerSubject,
        },
      },
      select: { userId: true },
    });

    return identity?.userId ?? null;
  }

  createPending(input: {
    creatorUserId: string;
    objectKey: string;
    contentType: string;
  }): Promise<StorageProofRecord> {
    return this.database.client.storedObject.create({
      data: { ...input, status: "PENDING" },
      select: storedObjectSelection,
    });
  }

  findOwned(
    id: string,
    creatorUserId: string,
  ): Promise<StorageProofRecord | null> {
    return this.database.client.storedObject.findFirst({
      where: { id, creatorUserId },
      select: storedObjectSelection,
    });
  }

  async markReady(
    id: string,
    creatorUserId: string,
    sizeBytes: number,
  ): Promise<StorageProofRecord | null> {
    await this.database.client.storedObject.updateMany({
      where: { id, creatorUserId, status: "PENDING" },
      data: {
        status: "READY",
        sizeBytes,
        completedAt: new Date(),
      },
    });

    return this.findOwned(id, creatorUserId);
  }

  async deletePending(id: string): Promise<void> {
    await this.database.client.storedObject.deleteMany({
      where: { id, status: "PENDING" },
    });
  }

  async deleteOwned(id: string, creatorUserId: string): Promise<void> {
    await this.database.client.storedObject.deleteMany({
      where: { id, creatorUserId },
    });
  }
}
