import { oc } from "@orpc/contract";
import { z } from "zod";

const registrationIdSchema = z.uuid();
const opaquePushTokenSchema = z
  .string()
  .min(1)
  .max(4096)
  .refine((token) => token.trim().length > 0 && token === token.trim(), {
    message: "A push token must be a non-empty opaque value.",
  });

export const pushRegistrationRegisterInputSchema = z
  .object({
    token: opaquePushTokenSchema,
    platform: z.enum(["ios", "android"]),
  })
  .strict();

export const pushRegistrationResponseSchema = z
  .object({
    id: registrationIdSchema,
    status: z.literal("ACTIVE"),
  })
  .strict();

export type PushRegistrationResponse = z.infer<
  typeof pushRegistrationResponseSchema
>;

export const pushRegistrationRegisterContract = oc
  .route({
    method: "POST",
    path: "/v1/push-registrations/register",
    summary: "Register the authenticated user's push destination",
    description:
      "AUTHENTICATED. Registers an opaque Expo push token and native platform. The token is never returned.",
    tags: ["Push"],
  })
  .input(pushRegistrationRegisterInputSchema)
  .output(pushRegistrationResponseSchema);

export const pushRegistrationUnregisterInputSchema = z
  .object({ id: registrationIdSchema })
  .strict();
export const pushRegistrationUnregisterResponseSchema = z
  .object({ disabled: z.literal(true) })
  .strict();

export const pushRegistrationUnregisterContract = oc
  .route({
    method: "POST",
    path: "/v1/push-registrations/unregister",
    summary: "Disable an owned push registration",
    description:
      "AUTHENTICATED. Disables only a push registration owned by the caller; missing and unowned IDs are indistinguishable.",
    tags: ["Push"],
  })
  .input(pushRegistrationUnregisterInputSchema)
  .output(pushRegistrationUnregisterResponseSchema);

export const foundationPushProofInputSchema = z
  .object({ registrationId: registrationIdSchema })
  .strict();
export const foundationPushProofResponseSchema = z
  .object({ proofId: z.uuid() })
  .strict();

export const foundationPushProofContract = oc
  .route({
    method: "POST",
    path: "/v1/foundation/push-proof",
    summary: "Queue a synthetic foundation push proof",
    description:
      "AUTHENTICATED. Development/test only. Queues a fixed harmless proof for an active registration owned by the caller.",
    tags: ["Foundation"],
  })
  .input(foundationPushProofInputSchema)
  .output(foundationPushProofResponseSchema);

export const pushRegistrationContracts = {
  register: pushRegistrationRegisterContract,
  unregister: pushRegistrationUnregisterContract,
};

export const foundationPushContracts = {
  proof: foundationPushProofContract,
};
