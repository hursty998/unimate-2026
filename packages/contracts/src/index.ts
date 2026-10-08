import { systemHealthContract } from "./system/health.js";
import { authMeContract } from "./auth/me.js";

export {
  systemHealthResponseSchema,
  type SystemHealthResponse,
} from "./system/health.js";
export { authMeResponseSchema, type AuthMeResponse } from "./auth/me.js";

export const contract = {
  system: {
    health: systemHealthContract,
  },
  auth: {
    me: authMeContract,
  },
};
