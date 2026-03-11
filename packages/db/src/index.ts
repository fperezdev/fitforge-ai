import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

// authUsers is an external Supabase-managed table used only for FK references.
// Exclude it from the drizzle schema to avoid relation normalization errors.
const { authUsers: _authUsers, ...querySchema } = schema;

export function createDb(connectionString: string) {
  const client = postgres(connectionString);
  return drizzle(client, { schema: querySchema });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema/index.js";
