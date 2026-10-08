import { systemHealthContract } from "./system/health.js";

export {
  systemHealthResponseSchema,
  type SystemHealthResponse,
} from "./system/health.js";

export const contract = {
  system: {
    health: systemHealthContract,
  },
};
