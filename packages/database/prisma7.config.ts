import "dotenv/config";
import { defineConfig } from "prisma/config";
import { validateDirectUrl } from "./connection-safety.mjs";

const directUrl = validateDirectUrl(process.env["DIRECT_URL"]);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: directUrl,
  },
});
