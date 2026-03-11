import { createDb, type Db } from "@fitforge/db";

let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is required");
    _db = createDb(url);
  }
  return _db;
}
