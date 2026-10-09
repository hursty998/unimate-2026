import { Inject, Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import { randomUUID } from "node:crypto";
import type {
  StorageProofCompletionResponse,
  StorageProofDeleteResponse,
  StorageProofReadPermissionResponse,
  StorageProofUploadPermissionResponse,
} from "@unimate/contracts";
import { parseObjectKey } from "@unimate/storage";
import {
  OBJECT_STORAGE,
  type ObjectStorage,
} from "../../infrastructure/object-storage.js";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";
import {
  STORAGE_PROOF_REPOSITORY,
  type StorageProofRecord,
  type StorageProofRepository,
} from "./storage-proof.repository.js";

const OBJECT_KEY_PREFIX = "foundation-storage-proof";
const PROOF_CONTENT_TYPE = "text/plain";
const MAX_PROOF_SIZE_BYTES = 1024 * 1024;
const READ_PERMISSION_LIFETIME_SECONDS = 5 * 60;

@Injectable()
export class StorageProofService {
  constructor(
    @Inject(STORAGE_PROOF_REPOSITORY)
    private readonly repository: StorageProofRepository,
    @Inject(OBJECT_STORAGE)
    private readonly objectStorage: ObjectStorage,
  ) {}

  async issueUpload(
    principal: AuthenticatedPrincipal,
  ): Promise<StorageProofUploadPermissionResponse> {
    const creatorUserId = await this.requireUserId(principal);
    const objectKey = parseObjectKey(
      `${OBJECT_KEY_PREFIX}/${randomUUID()}.txt`,
    );
    const record = await this.repository.createPending({
      creatorUserId,
      objectKey,
      contentType: PROOF_CONTENT_TYPE,
    });

    try {
      const permission = await this.objectStorage.createUploadPermission({
        key: objectKey,
        contentType: PROOF_CONTENT_TYPE,
      });
      const headers = permission.headers;

      if (
        headers["content-type"] !== PROOF_CONTENT_TYPE ||
        typeof headers["cache-control"] !== "string" ||
        headers["cache-control"].length === 0 ||
        headers["x-upsert"] !== "false"
      ) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "The storage-proof upload permission is invalid.",
        });
      }

      return {
        id: record.id,
        upload: {
          url: permission.url,
          method: permission.method,
          headers: {
            "content-type": headers["content-type"],
            "cache-control": headers["cache-control"],
            "x-upsert": headers["x-upsert"],
          },
          expiresAt: permission.expiresAt.toISOString(),
        },
      };
    } catch (cause) {
      try {
        await this.repository.deletePending(record.id);
      } catch (cleanupCause) {
        throw new AggregateError(
          [cause, cleanupCause],
          "Could not issue the storage-proof upload permission or remove its pending record.",
          { cause: cleanupCause },
        );
      }

      throw new Error("Could not issue the storage-proof upload permission.", {
        cause,
      });
    }
  }

  async completeUpload(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<StorageProofCompletionResponse> {
    const creatorUserId = await this.requireUserId(principal);
    const record = await this.repository.findOwned(id, creatorUserId);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Storage proof not found." });
    }

    if (record.status === "READY") {
      return this.toCompletionResponse(record);
    }

    const metadata = await this.objectStorage.getObjectMetadata(
      parseObjectKey(record.objectKey),
    );

    if (
      !metadata ||
      record.contentType !== PROOF_CONTENT_TYPE ||
      metadata.contentType !== record.contentType ||
      !Number.isSafeInteger(metadata.sizeBytes) ||
      metadata.sizeBytes < 1 ||
      metadata.sizeBytes > MAX_PROOF_SIZE_BYTES
    ) {
      throw new ORPCError("CONFLICT", {
        message:
          "The uploaded storage proof is missing or does not meet its requirements.",
      });
    }

    const completedRecord = await this.repository.markReady(
      record.id,
      creatorUserId,
      metadata.sizeBytes,
    );

    if (!completedRecord) {
      throw new ORPCError("NOT_FOUND", { message: "Storage proof not found." });
    }

    return this.toCompletionResponse(completedRecord);
  }

  async createReadPermission(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<StorageProofReadPermissionResponse> {
    const creatorUserId = await this.requireUserId(principal);
    const record = await this.repository.findOwned(id, creatorUserId);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Storage proof not found." });
    }

    if (record.status !== "READY") {
      throw new ORPCError("CONFLICT", {
        message: "Storage proof upload is incomplete.",
      });
    }

    const permission = await this.objectStorage.createReadPermission({
      key: parseObjectKey(record.objectKey),
      expiresInSeconds: READ_PERMISSION_LIFETIME_SECONDS,
    });

    return {
      url: permission.url,
      expiresAt: permission.expiresAt.toISOString(),
    };
  }

  async delete(
    principal: AuthenticatedPrincipal,
    id: string,
  ): Promise<StorageProofDeleteResponse> {
    const creatorUserId = await this.requireUserId(principal);
    const record = await this.repository.findOwned(id, creatorUserId);

    if (!record) {
      throw new ORPCError("NOT_FOUND", { message: "Storage proof not found." });
    }

    await this.objectStorage.deleteObject(parseObjectKey(record.objectKey));
    await this.repository.deleteOwned(record.id, creatorUserId);

    return { deleted: true };
  }

  private async requireUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string> {
    const userId = await this.repository.resolveUserId(principal);

    if (!userId) {
      throw new ORPCError("FORBIDDEN");
    }

    return userId;
  }

  private toCompletionResponse(
    record: StorageProofRecord,
  ): StorageProofCompletionResponse {
    if (
      record.status !== "READY" ||
      record.sizeBytes === null ||
      record.completedAt === null
    ) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "The storage-proof lifecycle record is inconsistent.",
      });
    }

    return {
      id: record.id,
      status: record.status,
      sizeBytes: record.sizeBytes,
      completedAt: record.completedAt.toISOString(),
    };
  }
}
