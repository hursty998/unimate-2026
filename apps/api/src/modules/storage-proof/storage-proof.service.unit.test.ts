import assert from "node:assert/strict";
import { test } from "node:test";
import { ORPCError } from "@orpc/server";
import type { AuthenticatedPrincipal } from "../auth/authenticated-principal.js";
import {
  storageProofIssueUploadInputSchema,
  storageProofUploadPermissionResponseSchema,
} from "@unimate/contracts";
import type {
  ObjectKey,
  ObjectStorage,
  ReadPermission,
  StoredObjectMetadata,
  UploadPermission,
} from "@unimate/storage";
import {
  type StorageProofRecord,
  type StorageProofRepository,
} from "./storage-proof.repository.js";
import { StorageProofService } from "./storage-proof.service.js";

const owner: AuthenticatedPrincipal = {
  provider: "SUPABASE",
  providerSubject: "provider-user-a",
};
const otherUser: AuthenticatedPrincipal = {
  provider: "SUPABASE",
  providerSubject: "provider-user-b",
};
const ownerId = "f0000000-0000-7000-8000-000000000001";
const otherUserId = "f0000000-0000-7000-8000-000000000002";
const proofId = "f0000000-0000-7000-8000-000000000003";
const uploadUrl =
  "https://storage.example.test/upload?capability=temporary-upload-token";
const readUrl =
  "https://storage.example.test/download?capability=temporary-read-token";

class InMemoryStorageProofRepository implements StorageProofRepository {
  readonly records = new Map<string, StorageProofRecord>();
  readonly createInputs: Array<{
    creatorUserId: string;
    objectKey: string;
    contentType: string;
  }> = [];
  readonly events: string[] = [];
  nextId = 3;
  deletePendingError: Error | undefined;

  async resolveUserId(
    principal: AuthenticatedPrincipal,
  ): Promise<string | null> {
    if (principal.providerSubject === owner.providerSubject) return ownerId;
    if (principal.providerSubject === otherUser.providerSubject)
      return otherUserId;
    return null;
  }

  async createPending(input: {
    creatorUserId: string;
    objectKey: string;
    contentType: string;
  }): Promise<StorageProofRecord> {
    this.createInputs.push(input);
    const id = `f0000000-0000-7000-8000-${String(this.nextId++).padStart(12, "0")}`;
    const record: StorageProofRecord = {
      id,
      ...input,
      status: "PENDING",
      sizeBytes: null,
      createdAt: new Date("2026-10-08T12:00:00.000Z"),
      completedAt: null,
    };
    this.records.set(id, record);
    return record;
  }

  async findOwned(
    id: string,
    creatorUserId: string,
  ): Promise<StorageProofRecord | null> {
    const record = this.records.get(id);
    return record?.creatorUserId === creatorUserId ? record : null;
  }

  async markReady(
    id: string,
    creatorUserId: string,
    sizeBytes: number,
  ): Promise<StorageProofRecord | null> {
    const record = await this.findOwned(id, creatorUserId);
    if (!record) return null;
    if (record.status === "PENDING") {
      const completed: StorageProofRecord = {
        ...record,
        status: "READY",
        sizeBytes,
        completedAt: new Date("2026-10-08T12:01:00.000Z"),
      };
      this.records.set(id, completed);
      return completed;
    }
    return record;
  }

  async deletePending(id: string): Promise<void> {
    this.events.push("repository.deletePending");
    if (this.deletePendingError) throw this.deletePendingError;
    if (this.records.get(id)?.status === "PENDING") this.records.delete(id);
  }

  async deleteOwned(id: string, creatorUserId: string): Promise<void> {
    this.events.push("repository.deleteOwned");
    if ((await this.findOwned(id, creatorUserId)) !== null) {
      this.records.delete(id);
    }
  }
}

class FakeObjectStorage implements ObjectStorage {
  readonly events: string[] = [];
  readonly uploadKeys: ObjectKey[] = [];
  readonly readKeys: ObjectKey[] = [];
  readonly deletedKeys: ObjectKey[] = [];
  readonly objects = new Map<string, StoredObjectMetadata>();
  uploadHeaders: Readonly<Record<string, string>> = {
    "content-type": "text/plain",
    "x-proof-capability": "temporary-upload-header",
  };
  uploadError: Error | undefined;
  deleteError: Error | undefined;

  async createUploadPermission({
    key,
  }: {
    key: ObjectKey;
    contentType: string;
  }): Promise<UploadPermission> {
    this.uploadKeys.push(key);
    if (this.uploadError) throw this.uploadError;
    return {
      url: uploadUrl,
      method: "PUT",
      headers: this.uploadHeaders,
      expiresAt: new Date("2026-10-08T14:00:00.000Z"),
    };
  }

  async createReadPermission({
    key,
  }: {
    key: ObjectKey;
    expiresInSeconds: number;
  }): Promise<ReadPermission> {
    this.readKeys.push(key);
    return {
      url: readUrl,
      expiresAt: new Date("2026-10-08T12:06:00.000Z"),
    };
  }

  async getObjectMetadata(
    key: ObjectKey,
  ): Promise<StoredObjectMetadata | null> {
    this.events.push("storage.getObjectMetadata");
    return this.objects.get(key) ?? null;
  }

  async deleteObject(key: ObjectKey): Promise<void> {
    this.events.push("storage.deleteObject");
    if (this.deleteError) throw this.deleteError;
    this.deletedKeys.push(key);
    this.objects.delete(key);
  }
}

function setup() {
  const repository = new InMemoryStorageProofRepository();
  const objectStorage = new FakeObjectStorage();
  const service = new StorageProofService(repository, objectStorage);
  return { repository, objectStorage, service };
}

async function assertOrpcCode(
  action: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(
    action,
    (error: unknown) => error instanceof ORPCError && error.code === code,
  );
}

test("issues an upload capability for a server-generated key and persists only provider-neutral metadata", async () => {
  const { repository, objectStorage, service } = setup();

  const response = await service.issueUpload(owner);

  assert.equal(response.id, proofId);
  assert.equal(response.upload.url, uploadUrl);
  assert.equal(response.upload.method, "PUT");
  assert.deepEqual(response.upload.headers, objectStorage.uploadHeaders);
  assert.deepEqual(repository.createInputs, [
    {
      creatorUserId: ownerId,
      objectKey: objectStorage.uploadKeys[0],
      contentType: "text/plain",
    },
  ]);
  assert.match(
    repository.createInputs[0]?.objectKey ?? "",
    /^foundation-storage-proof\/[0-9a-f-]+\.txt$/,
  );
  assert.deepEqual(Object.keys(repository.records.get(proofId) ?? {}).sort(), [
    "completedAt",
    "contentType",
    "createdAt",
    "creatorUserId",
    "id",
    "objectKey",
    "sizeBytes",
    "status",
  ]);
  assert.equal(JSON.stringify(response).includes("sb_secret_"), false);
  assert.equal(
    JSON.stringify(repository.records.get(proofId)).includes(uploadUrl),
    false,
  );
});

test("the issue contract accepts control JSON only, never caller-supplied bytes or object keys", () => {
  assert.equal(storageProofIssueUploadInputSchema.safeParse({}).success, true);
  assert.equal(
    storageProofIssueUploadInputSchema.safeParse({ bytes: [1, 2, 3] }).success,
    false,
  );
  assert.equal(
    storageProofIssueUploadInputSchema.safeParse({
      objectKey: "caller-chosen/object.txt",
    }).success,
    false,
  );
});

test("the upload contract accepts generic safe capability headers and requires text/plain", () => {
  const response = storageProofUploadPermissionResponseSchema.safeParse({
    id: proofId,
    upload: {
      url: uploadUrl,
      method: "PUT",
      headers: {
        "content-type": "text/plain",
        "x-provider-capability": "scoped",
      },
      expiresAt: "2026-10-08T14:00:00.000Z",
    },
  });
  assert.equal(response.success, true);

  const invalidContentType =
    storageProofUploadPermissionResponseSchema.safeParse({
      id: proofId,
      upload: {
        url: uploadUrl,
        method: "PUT",
        headers: { "content-type": "image/png" },
        expiresAt: "2026-10-08T14:00:00.000Z",
      },
    });
  assert.equal(invalidContentType.success, false);

  const invalidHeaderValue =
    storageProofUploadPermissionResponseSchema.safeParse({
      id: proofId,
      upload: {
        url: uploadUrl,
        method: "PUT",
        headers: {
          "content-type": "text/plain",
          "x-provider-capability": "safe\r\nx-injected: true",
        },
        expiresAt: "2026-10-08T14:00:00.000Z",
      },
    });
  assert.equal(invalidHeaderValue.success, false);
});

test("another authenticated user cannot complete, read, or delete an owner's proof", async () => {
  const { objectStorage, service } = setup();
  const issued = await service.issueUpload(owner);

  await assertOrpcCode(
    service.completeUpload(otherUser, issued.id),
    "NOT_FOUND",
  );
  await assertOrpcCode(
    service.createReadPermission(otherUser, issued.id),
    "NOT_FOUND",
  );
  await assertOrpcCode(service.delete(otherUser, issued.id), "NOT_FOUND");

  assert.deepEqual(objectStorage.events, []);
  assert.deepEqual(objectStorage.readKeys, []);
  assert.deepEqual(objectStorage.deletedKeys, []);
});

test("completion remains pending for missing or inappropriate provider objects and pending objects cannot be read", async () => {
  const { repository, objectStorage, service } = setup();
  const issued = await service.issueUpload(owner);

  await assertOrpcCode(service.completeUpload(owner, issued.id), "CONFLICT");
  await assertOrpcCode(
    service.createReadPermission(owner, issued.id),
    "CONFLICT",
  );

  const key = objectStorage.uploadKeys[0];
  assert.ok(key);
  objectStorage.objects.set(key, { contentType: "image/png", sizeBytes: 12 });
  await assertOrpcCode(service.completeUpload(owner, issued.id), "CONFLICT");

  objectStorage.objects.set(key, { contentType: "text/plain", sizeBytes: 0 });
  await assertOrpcCode(service.completeUpload(owner, issued.id), "CONFLICT");

  objectStorage.objects.set(key, {
    contentType: "text/plain",
    sizeBytes: 1_048_577,
  });
  await assertOrpcCode(service.completeUpload(owner, issued.id), "CONFLICT");

  assert.equal(repository.records.get(issued.id)?.status, "PENDING");
  assert.deepEqual(objectStorage.readKeys, []);
});

test("the owner can complete a provider-verified upload and obtain a read capability", async () => {
  const { repository, objectStorage, service } = setup();
  const issued = await service.issueUpload(owner);
  const key = objectStorage.uploadKeys[0];
  assert.ok(key);
  objectStorage.objects.set(key, { contentType: "text/plain", sizeBytes: 42 });

  const completed = await service.completeUpload(owner, issued.id);
  assert.deepEqual(completed, {
    id: issued.id,
    status: "READY",
    sizeBytes: 42,
    completedAt: "2026-10-08T12:01:00.000Z",
  });
  assert.equal(repository.records.get(issued.id)?.status, "READY");

  const permission = await service.createReadPermission(owner, issued.id);
  assert.deepEqual(permission, {
    url: readUrl,
    expiresAt: "2026-10-08T12:06:00.000Z",
  });
  assert.deepEqual(objectStorage.readKeys, [key]);
});

test("cleanup is owner-scoped, deletes provider bytes before metadata, and retains metadata if byte deletion fails", async () => {
  const { repository, objectStorage, service } = setup();
  const issued = await service.issueUpload(owner);

  await assertOrpcCode(service.delete(otherUser, issued.id), "NOT_FOUND");
  assert.deepEqual(repository.events, []);

  const key = objectStorage.uploadKeys[0];
  assert.ok(key);
  objectStorage.objects.set(key, { contentType: "text/plain", sizeBytes: 42 });
  assert.deepEqual(await service.delete(owner, issued.id), { deleted: true });
  assert.deepEqual(objectStorage.events, ["storage.deleteObject"]);
  assert.deepEqual(repository.events, ["repository.deleteOwned"]);
  assert.equal(repository.records.has(issued.id), false);

  const secondIssued = await service.issueUpload(owner);
  objectStorage.deleteError = new Error("provider failure");
  await assert.rejects(
    service.delete(owner, secondIssued.id),
    /provider failure/,
  );
  assert.equal(repository.records.has(secondIssued.id), true);
});

test("a failed capability request removes its pending application record", async () => {
  const { repository, objectStorage, service } = setup();
  objectStorage.uploadError = new Error("signed permission unavailable");

  await assert.rejects(
    service.issueUpload(owner),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      error.cause.message === "signed permission unavailable",
  );
  assert.equal(repository.records.size, 0);
  assert.deepEqual(repository.events, ["repository.deletePending"]);
});

test("invalid provider capability headers fail closed and remove pending metadata", async () => {
  const { repository, objectStorage, service } = setup();
  objectStorage.uploadHeaders = {
    "content-type": "text/plain",
    "x-provider-capability": "invalid\r\nx-injected: true",
  };

  await assert.rejects(
    service.issueUpload(owner),
    (error: unknown) => error instanceof Error && error.cause instanceof Error,
  );
  assert.equal(repository.records.size, 0);
  assert.deepEqual(repository.events, ["repository.deletePending"]);
});

test("an authenticated principal without a UniMate User mapping is denied", async () => {
  const { repository, service } = setup();

  await assertOrpcCode(
    service.issueUpload({
      provider: "SUPABASE",
      providerSubject: "unmapped-provider-user",
    }),
    "FORBIDDEN",
  );
  assert.equal(repository.records.size, 0);
});
