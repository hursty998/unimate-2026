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
);
