import type { SqlJsStatic } from "sql.js";

let loading: Promise<SqlJsStatic> | null = null;

/**
 * SQLite compiled to WebAssembly, loaded the first time an Anki deck is
 * read. The .wasm file is served from public/sqljs
 * (scripts/copy-browser-assets.mjs).
 */
export function loadSqlite(): Promise<SqlJsStatic> {
  loading ??= import("sql.js")
    .then((m) => m.default({ locateFile: () => "/sqljs/sql-wasm-browser.wasm" }))
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
