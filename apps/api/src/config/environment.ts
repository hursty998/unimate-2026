import { z } from "zod";

const httpOriginSchema = z
  .string()
  .url()
  .refine((origin) => {
    const parsedOrigin = new URL(origin);

    return (
      (parsedOrigin.protocol === "http:" ||
        parsedOrigin.protocol === "https:") &&
      parsedOrigin.origin === origin
    );
  }, "Expected an HTTP(S) origin without a path");

const apiEnvironmentSchema = z.object({
  API_HOST: z.string().min(1).default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_CORS_ORIGINS: z
    .string()
    .default("")
    .transform((origins) =>
      origins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(httpOriginSchema)),
});

export type ApiConfig = {
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  corsOrigins: string[];
};

export function parseApiConfig(
  environment: NodeJS.ProcessEnv = process.env,
): ApiConfig {
  const parsedEnvironment = apiEnvironmentSchema.parse(environment);

  return {
    host: parsedEnvironment.API_HOST,
    port: parsedEnvironment.API_PORT,
    nodeEnv: parsedEnvironment.NODE_ENV,
    corsOrigins: parsedEnvironment.API_CORS_ORIGINS,
  };
}
