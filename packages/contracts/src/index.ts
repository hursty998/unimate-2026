import { systemHealthContract } from "./system/health.js";
import { authMeContract } from "./auth/me.js";
import { foundationPushContracts, pushRegistrationContracts } from "./push.js";
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
export {
  foundationPushProofContract,
  foundationPushProofInputSchema,
  foundationPushProofResponseSchema,
  pushRegistrationRegisterInputSchema,
  pushRegistrationResponseSchema,
  pushRegistrationUnregisterInputSchema,
  pushRegistrationUnregisterResponseSchema,
  type PushRegistrationResponse,
} from "./push.js";

export const contract = {
  system: {
    health: systemHealthContract,
  },
  auth: {
    me: authMeContract,
  },
  storageProof: storageProofContracts,
  pushRegistration: pushRegistrationContracts,
  foundationPush: foundationPushContracts,
};
