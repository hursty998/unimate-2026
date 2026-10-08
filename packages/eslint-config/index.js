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
                "@unimate/mobile",
                "@unimate/mobile/**",
                "@supabase/*",
                "@supabase/**",
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
