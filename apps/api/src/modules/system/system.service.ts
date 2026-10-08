import { Injectable } from "@nestjs/common";
import type { SystemHealthResponse } from "@unimate/contracts";

@Injectable()
export class SystemService {
  health(): SystemHealthResponse {
    return {
      status: "ok",
      service: "unimate-api",
      apiVersion: "v1",
    };
  }
}
