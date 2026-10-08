import { oc } from "@orpc/contract";
import { z } from "zod";

export const authMeResponseSchema = z
  .object({
    user: z
      .object({
        id: z.string().uuid(),
      })
      .strict(),
    universityAffiliations: z.array(
      z
        .object({
          universityId: z.string().uuid(),
        })
        .strict(),
    ),
  })
  .strict();

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

export const authMeContract = oc
  .route({
    method: "GET",
    path: "/v1/auth/me",
    summary: "Get the authenticated UniMate identity",
    description:
      "AUTHENTICATED identity operation. Authentication does not imply university affiliation or product authorisation.",
    tags: ["Auth"],
  })
  .output(authMeResponseSchema);
