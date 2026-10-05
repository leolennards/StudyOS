import { customType } from "drizzle-orm/pg-core";

/** A Postgres full-text search vector. Only ever written by a generated column. */
export const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });
