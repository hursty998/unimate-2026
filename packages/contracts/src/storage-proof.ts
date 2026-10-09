import { oc } from "@orpc/contract";
import { z } from "zod";

const storageProofIdSchema = z.string().uuid();

export const storageProofIssueUploadInputSchema = z.object({}).strict();

const uploadHeadersSchema = z
  .record(
    z.string().regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
    z.string().refine((value) => !/[\r\n]/.test(value)),
  )
  .refine((headers) => headers["content-type"] === "text/plain", {
    message: "Storage-proof upload capabilities must require text/plain.",
  });

export const storageProofUploadPermissionResponseSchema = z
  .object({
    id: storageProofIdSchema,
    upload: z
      .object({
        url: z.string().url(),
        method: z.literal("PUT"),
        headers: uploadHeadersSchema,
        expiresAt: z.iso.datetime(),
      })
      .strict(),
  })
  .strict();

export type StorageProofUploadPermissionResponse = z.infer<
  typeof storageProofUploadPermissionResponseSchema
>;

export const storageProofCompletionResponseSchema = z
  .object({
    id: storageProofIdSchema,
    status: z.literal("READY"),
    sizeBytes: z.number().int().positive(),
    completedAt: z.iso.datetime(),
  })
  .strict();

export type StorageProofCompletionResponse = z.infer<
  typeof storageProofCompletionResponseSchema
>;

export const storageProofReadPermissionResponseSchema = z
  .object({
    url: z.string().url(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

export type StorageProofReadPermissionResponse = z.infer<
  typeof storageProofReadPermissionResponseSchema
>;

export const storageProofDeleteResponseSchema = z
  .object({ deleted: z.literal(true) })
  .strict();

export type StorageProofDeleteResponse = z.infer<
  typeof storageProofDeleteResponseSchema
>;

export const storageProofIssueUploadContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/storage-proof/uploads/issue",
    summary: "Issue a foundation storage-proof upload capability",
    description:
      "AUTHENTICATED. Returns a short-lived upload capability; file bytes are uploaded directly to private object storage.",
    tags: ["Foundation"],
  })
  .input(storageProofIssueUploadInputSchema)
  .output(storageProofUploadPermissionResponseSchema);

const storageProofIdInputSchema = z
  .object({ id: storageProofIdSchema })
  .strict();

export const storageProofCompleteUploadContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/storage-proof/uploads/complete",
    summary: "Verify completion of a foundation storage-proof upload",
    description:
      "AUTHENTICATED. Verifies provider metadata for an owned proof object; file bytes are not accepted by this API.",
    tags: ["Foundation"],
  })
  .input(storageProofIdInputSchema)
  .output(storageProofCompletionResponseSchema);

export const storageProofReadPermissionContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/storage-proof/read-permission",
    summary: "Issue a foundation storage-proof read capability",
    description:
      "AUTHENTICATED. Only the owner of a verified proof object can receive a short-lived read capability.",
    tags: ["Foundation"],
  })
  .input(storageProofIdInputSchema)
  .output(storageProofReadPermissionResponseSchema);

export const storageProofDeleteContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/storage-proof/delete",
    summary: "Delete an owned foundation storage-proof object",
    description:
      "AUTHENTICATED. Deletes the owned object from private storage before removing its application record.",
    tags: ["Foundation"],
  })
  .input(storageProofIdInputSchema)
  .output(storageProofDeleteResponseSchema);

export const storageProofContracts = {
  issueUpload: storageProofIssueUploadContract,
  completeUpload: storageProofCompleteUploadContract,
  readPermission: storageProofReadPermissionContract,
  delete: storageProofDeleteContract,
};
