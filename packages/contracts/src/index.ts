import { systemHealthContract } from "./system/health.js";
import { authMeContract } from "./auth/me.js";
import { storageProofContracts } from "./storage-proof.js";

export {
  systemHealthResponseSchema,
  type SystemHealthResponse,
} from "./system/health.js";
export { authMeResponseSchema, type AuthMeResponse } from "./auth/me.js";
export {
  storageProofIssueUploadInputSchema,
  storageProofCompletionResponseSchema,
  storageProofDeleteResponseSchema,
  storageProofReadPermissionResponseSchema,
  storageProofUploadPermissionResponseSchema,
  type StorageProofCompletionResponse,
  type StorageProofDeleteResponse,
  type StorageProofReadPermissionResponse,
  type StorageProofUploadPermissionResponse,
} from "./storage-proof.js";

export const contract = {
  system: {
    health: systemHealthContract,
  },
  auth: {
    me: authMeContract,
  },
  storageProof: storageProofContracts,
};
