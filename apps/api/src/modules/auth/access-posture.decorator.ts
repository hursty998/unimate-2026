import { SetMetadata } from "@nestjs/common";

export const API_ACCESS_POSTURE_METADATA = "unimate:api-access-posture";

export type ApiAccessPosture = "PUBLIC" | "AUTHENTICATED" | "AUTHORISED";

export const Public = () =>
  SetMetadata(API_ACCESS_POSTURE_METADATA, "PUBLIC" satisfies ApiAccessPosture);

export const Authenticated = () =>
  SetMetadata(
    API_ACCESS_POSTURE_METADATA,
    "AUTHENTICATED" satisfies ApiAccessPosture,
  );
