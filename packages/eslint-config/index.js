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
                "@unimate/database/*",
                "@unimate/database/**",
                "@unimate/*/server",
                "@unimate/*/server/**",
                "@prisma/*",
              ],
              message:
                "Mobile must not import database internals or server-only implementations.",
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
