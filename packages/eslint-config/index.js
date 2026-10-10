import js from "@eslint/js";
import tseslint from "typescript-eslint";

const workerProviderAdapterPattern = {
  group: [
    "@unimate/storage/supabase",
    "@unimate/storage/supabase/**",
    "@unimate/queue/supabase",
    "@unimate/queue/supabase/**",
    "@unimate/notifications/expo",
    "@unimate/notifications/expo/**",
    "@unimate/observability/opentelemetry",
    "@unimate/observability/opentelemetry/**",
  ],
  message:
    "Worker business code consumes provider-neutral ports; provider adapters stay in the worker composition boundary.",
};

const workerVendorImportPattern = {
  group: [
    "@supabase/*",
    "@supabase/**",
    "@aws-sdk/*",
    "@aws-sdk/**",
    "pg",
    "pg/**",
    "expo-server-sdk",
    "@opentelemetry/sdk-*",
    "@opentelemetry/exporter-*",
  ],
  message:
    "Worker composition uses UniMate provider adapters; vendor infrastructure SDKs stay behind provider packages.",
};

export default tseslint.config(
  {
    ignores: [
      "**/.agents/**",
      "**/.expo/**",
      "**/.turbo/**",
      "**/android/**",
      "**/build/**",
      "**/coverage/**",
      "**/dist/**",
      "**/ios/**",
      "**/node_modules/**",
      "**/.test-dist/**",
      "**/web-build/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{cjs,js,mjs,ts,tsx}"],
    rules: {
      "no-duplicate-imports": "error",
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    files: ["apps/mobile/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@unimate/api",
              message:
                "Mobile must use the shared API contract; the server package is not a client dependency.",
            },
            {
              name: "@unimate/database",
              message:
                "Mobile must use the shared API contract; database access is server-only.",
            },
            {
              name: "@unimate/authorization",
              message:
                "Mobile must not implement or rely on the server-side authorization system.",
            },
            {
              name: "@prisma/client",
              message:
                "Mobile must use the shared API contract; Prisma is server-only.",
            },
            {
              name: "prisma",
              message:
                "Mobile must use the shared API contract; Prisma is server-only.",
            },
          ],
          patterns: [
            {
              group: [
                "@unimate/api/*",
                "@unimate/api/**",
                "@unimate/authorization",
                "@unimate/authorization/**",
                "@unimate/database/*",
                "@unimate/database/**",
                "@unimate/*/server",
                "@unimate/*/server/**",
                "@nestjs/*",
                "@nestjs/**",
                "@orpc/nest",
                "@orpc/server",
                "@prisma/*",
                "@aws-sdk/*",
                "@aws-sdk/**",
                "pg",
                "pg/**",
                "expo-server-sdk",
                "@opentelemetry/*",
                "@opentelemetry/**",
              ],
              message:
                "Mobile must not import the API, NestJS, database internals, or server-only implementations.",
            },
            {
              group: [
                "@unimate/queue",
                "@unimate/queue/**",
                "@unimate/notifications",
                "@unimate/notifications/**",
                "@unimate/storage/supabase",
                "@unimate/storage/supabase/**",
                "@unimate/observability/node",
                "@unimate/observability/node/**",
                "@unimate/observability/opentelemetry",
                "@unimate/observability/opentelemetry/**",
              ],
              message:
                "Mobile may not import server queue, push-delivery, storage-adapter, or telemetry implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/contracts/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nestjs/*",
                "@nestjs/**",
                "@prisma/*",
                "@prisma/**",
                "@unimate/api",
                "@unimate/api/**",
                "@unimate/database",
                "@unimate/database/*",
                "@unimate/database/**",
                "@unimate/authorization",
                "@unimate/authorization/*",
                "@unimate/authorization/**",
                "@unimate/mobile",
                "@unimate/mobile/**",
                "@supabase/*",
                "@supabase/**",
                "prisma",
                "@aws-sdk/*",
                "@aws-sdk/**",
                "@sentry/*",
                "@sentry/**",
                "@orpc/nest",
                "@orpc/server",
                "expo",
                "expo-*",
                "react-native",
                "react-native-*",
              ],
              message:
                "Contracts may depend only on transport-neutral contract/schema code, not server, mobile, database, or provider implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/**/*.{js,jsx,ts,tsx}"],
    ignores: ["apps/api/src/providers/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@unimate/mobile", "@unimate/mobile/**"],
              message:
                "The API may depend on shared contracts, not the Expo application.",
            },
            {
              group: [
                "@unimate/storage/supabase",
                "@unimate/storage/supabase/**",
                "@unimate/queue/supabase",
                "@unimate/queue/supabase/**",
                "@unimate/notifications/expo",
                "@unimate/notifications/expo/**",
                "@unimate/observability/opentelemetry",
                "@unimate/observability/opentelemetry/**",
                "pg",
                "pg/**",
                "expo-server-sdk",
                "@opentelemetry/sdk-*",
                "@opentelemetry/exporter-*",
                "@aws-sdk/*",
                "@aws-sdk/**",
              ],
              message:
                "API feature code consumes provider-neutral ports; implementation adapters and provider SDKs stay behind provider boundaries.",
            },
            {
              group: ["@supabase/*", "@supabase/**"],
              message:
                "API runtime authentication must use @unimate/auth; provider SDKs are test-harness-only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/api/src/providers/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@unimate/mobile",
                "@unimate/mobile/**",
                "@supabase/*",
                "@supabase/**",
                "@aws-sdk/*",
                "@aws-sdk/**",
                "pg",
                "pg/**",
                "expo-server-sdk",
                "@opentelemetry/*",
                "@opentelemetry/**",
              ],
              message:
                "API composition may wire provider adapter subpaths, but vendor SDKs stay inside their provider packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/mobile/**/*.{js,jsx,ts,tsx}"],
    ignores: ["apps/mobile/src/lib/auth/**/*"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*", "@supabase/**"],
              message:
                "Supabase JS is confined to apps/mobile/src/lib/auth; feature code uses the UniMate auth context.",
            },
            {
              group: [
                "@unimate/queue",
                "@unimate/queue/**",
                "@unimate/notifications",
                "@unimate/notifications/**",
                "@unimate/storage/supabase",
                "@unimate/storage/supabase/**",
                "@unimate/observability/node",
                "@unimate/observability/node/**",
                "@unimate/observability/opentelemetry",
                "@unimate/observability/opentelemetry/**",
              ],
              message:
                "Mobile may not import server queue, push-delivery, storage-adapter, or telemetry implementations.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/auth/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nestjs/*",
                "@nestjs/**",
                "@prisma/*",
                "@prisma/**",
                "@supabase/*",
                "@supabase/**",
                "@unimate/*",
                "@unimate/**",
                "expo",
                "expo-*",
                "react-native",
                "react-native-*",
              ],
              message:
                "The auth package is a provider adapter boundary and cannot depend on application, NestJS, database, Supabase JS, or mobile runtime code.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/database/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nestjs/*",
                "@nestjs/**",
                "@supabase/*",
                "@supabase/**",
                "@unimate/*",
                "@unimate/**",
                "expo",
                "expo-*",
                "react-native",
                "react-native-*",
              ],
              message:
                "The database package may depend on PostgreSQL/Prisma infrastructure, not application packages, framework runtimes, or Supabase SDKs.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/authorization/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@nestjs/*",
                "@nestjs/**",
                "@prisma/*",
                "@prisma/**",
                "@supabase/*",
                "@supabase/**",
                "@unimate/*",
                "@unimate/**",
                "expo",
                "expo-*",
                "react-native",
                "react-native-*",
                "prisma",
              ],
              message:
                "The authorization package is the pure capability source of truth and cannot depend on frameworks, providers, database, or application packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/worker/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [workerProviderAdapterPattern, workerVendorImportPattern],
        },
      ],
    },
  },
  {
    files: ["apps/worker/src/providers/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [workerVendorImportPattern],
        },
      ],
    },
  },
  {
    files: ["packages/storage/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@unimate/queue",
                "@unimate/queue/**",
                "@unimate/notifications",
                "@unimate/notifications/**",
                "@unimate/observability",
                "@unimate/observability/**",
              ],
              message:
                "Object storage is an independent provider boundary and cannot depend on queue, push, or telemetry packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/queue/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@unimate/storage",
                "@unimate/storage/**",
                "@unimate/notifications",
                "@unimate/notifications/**",
                "@unimate/observability",
                "@unimate/observability/**",
              ],
              message:
                "Queueing is an independent provider boundary and cannot depend on storage, push, or telemetry packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/notifications/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@unimate/storage",
                "@unimate/storage/**",
                "@unimate/queue",
                "@unimate/queue/**",
                "@unimate/observability",
                "@unimate/observability/**",
                "expo-server-sdk",
              ],
              message:
                "Push delivery is independent of storage, queue, and telemetry providers and uses the Expo HTTP API adapter.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["packages/observability/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@unimate/storage",
                "@unimate/storage/**",
                "@unimate/queue",
                "@unimate/queue/**",
                "@unimate/notifications",
                "@unimate/notifications/**",
              ],
              message:
                "Telemetry is an independent provider boundary and cannot depend on storage, queue, or push packages.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/mobile/plugins/**/*.js"],
    languageOptions: {
      globals: {
        module: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
