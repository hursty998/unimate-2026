import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
                "@unimate/database/*",
                "@unimate/database/**",
                "@unimate/*/server",
                "@unimate/*/server/**",
                "@nestjs/*",
                "@nestjs/**",
                "@orpc/nest",
                "@orpc/server",
                "@prisma/*",
              ],
              message:
                "Mobile must not import the API, NestJS, database internals, or server-only implementations.",
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
    files: ["apps/api/**/*.{js,jsx,ts,tsx}"],
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
