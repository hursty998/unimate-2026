import { z } from "zod";

const httpOriginSchema = z
  .string()
  .url()
  .refine((origin) => {
    try {
      const parsedOrigin = new URL(origin);

      return (
        (parsedOrigin.protocol === "http:" ||
          parsedOrigin.protocol === "https:") &&
        parsedOrigin.origin === origin
      );
    } catch {
      return false;
    }
  }, "Expected an HTTP(S) origin without a path");

const postgresUrlSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const parsedUrl = new URL(value);

      return (
        parsedUrl.protocol === "postgres:" ||
        parsedUrl.protocol === "postgresql:"
      );
    } catch {
      return false;
    }
  }, "Expected a PostgreSQL connection URL");

const optionalSupabaseSecretKeySchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(z.string().startsWith("sb_secret_").optional());

const optionalStorageBucketSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(
    z
      .string()
      .regex(/^[a-z0-9][a-z0-9_-]{0,62}$/)
      .optional(),
  );

const apiEnvironmentSchema = z
  .object({
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
    DATABASE_URL: postgresUrlSchema,
    SUPABASE_URL: httpOriginSchema,
    SUPABASE_JWT_AUDIENCE: z.string().trim().min(1).default("authenticated"),
    SUPABASE_SECRET_KEY: optionalSupabaseSecretKeySchema,
    SUPABASE_STORAGE_BUCKET: optionalStorageBucketSchema,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV === "production") return;

    if (!environment.SUPABASE_SECRET_KEY) {
      context.addIssue({
        code: "custom",
        path: ["SUPABASE_SECRET_KEY"],
        message: "SUPABASE_SECRET_KEY is required outside production.",
      });
    }

    if (!environment.SUPABASE_STORAGE_BUCKET) {
      context.addIssue({
        code: "custom",
        path: ["SUPABASE_STORAGE_BUCKET"],
        message: "SUPABASE_STORAGE_BUCKET is required outside production.",
      });
    }
  });

export type ApiConfig = {
  host: string;
  port: number;
  nodeEnv: "development" | "test" | "production";
  corsOrigins: string[];
  databaseUrl: string;
  supabaseUrl: string;
  supabaseJwtAudience: string;
  supabaseSecretKey: string | undefined;
  supabaseStorageBucket: string | undefined;
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
    databaseUrl: parsedEnvironment.DATABASE_URL,
    supabaseUrl: parsedEnvironment.SUPABASE_URL,
    supabaseJwtAudience: parsedEnvironment.SUPABASE_JWT_AUDIENCE,
    supabaseSecretKey: parsedEnvironment.SUPABASE_SECRET_KEY,
    supabaseStorageBucket: parsedEnvironment.SUPABASE_STORAGE_BUCKET,
  };
}
