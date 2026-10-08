import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

export interface DatabaseClientOptions {
  connectionString: string;
}

export function createDatabaseClient({
  connectionString,
}: DatabaseClientOptions): PrismaClient {
  if (connectionString.trim().length === 0) {
    throw new Error("A PostgreSQL connection string is required.");
  }

  const adapter = new PrismaPg({ connectionString }, { schema: "app" });

  return new PrismaClient({ adapter });
}
