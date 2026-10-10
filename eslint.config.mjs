import unimate from "@unimate/eslint-config";

export default [
  ...unimate,
  {
    files: ["apps/api/src/**/*.ts", "apps/worker/src/**/*.ts"],
    ignores: [
      "apps/api/src/**/*.test.ts",
      "apps/api/src/**/*.spec.ts",
      "apps/api/src/**/test-support/**",
      "apps/worker/src/**/*.test.ts",
      "apps/worker/src/**/*.spec.ts",
      "apps/worker/src/**/test-support/**",
    ],
    rules: {
      "no-console": "error",
    },
  },
];
