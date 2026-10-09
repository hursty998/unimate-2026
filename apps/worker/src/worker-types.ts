import type { createDatabaseClient } from "@unimate/database";

export type WorkerDatabase = ReturnType<typeof createDatabaseClient>;
