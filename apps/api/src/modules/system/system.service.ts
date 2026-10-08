import type { SystemHealthResponse } from "@unimate/contracts";

export class SystemService {
  health(): SystemHealthResponse {
    return {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    };
  }
}
