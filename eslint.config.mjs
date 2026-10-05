import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

/**
 * Module boundaries (Architecture §4), enforced here and in CI.
 * Each rule scopes its *source* with ESLint's own `files` glob and its
 * *destination* with a boundaries file category.
 */
const MODULE_PRIVATE = "src/server/modules/*/{repository,jobs}.ts";
const MODULE_PUBLIC = "src/server/modules/*/{service,schemas,types}.ts";
const MODULE_DOMAIN = "src/server/modules/*/domain/**";
const DB = "src/server/platform/db/**";

const boundariesSettings = {
  "boundaries/include": ["src/**/*.{ts,tsx}"],
  "boundaries/elements": [
    { type: "app", pattern: "src/app" },
    { type: "ui", pattern: "src/components" },
    { type: "ui", pattern: "src/features" },
    { type: "actions", pattern: "src/server/actions" },
    { type: "module", pattern: "src/server/modules/*" },
    { type: "platform", pattern: "src/server/platform/*" },
    { type: "server-lib", pattern: "src/server/lib" },
  ],
  "boundaries/files": [
    { category: "module-private", pattern: MODULE_PRIVATE },
    { category: "module-public", pattern: MODULE_PUBLIC },
    { category: "db", pattern: DB },
  ],
};

const deny = (categories, message) => ({
  "boundaries/dependencies": [
    "error",
    {
      default: "allow",
      policies: [{ disallow: { to: { file: { categories: { anyOf: categories } } }, message } }],
    },
  ],
});

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { plugins: { boundaries }, settings: boundariesSettings },
  {
    // UI calls services and Server Actions, never a repository or the database.
    files: ["src/app/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}", "src/features/**/*.{ts,tsx}"],
    ignores: ["src/app/api/**"],
    rules: deny(
      ["module-private", "db"],
      "UI must not use a module's repository or the database. Call a service (src/server/modules/*/service.ts) or a Server Action instead.",
    ),
  },
  {
    // A module may call another module's service, never its repository.
    files: [MODULE_PUBLIC, MODULE_PRIVATE],
    rules: deny(
      ["module-private"],
      "A module may call another module's service, never its repository. Cross-module reads go through the service.",
    ),
  },
  {
    // Domain logic stays pure: no database, no services, no I/O.
    files: [MODULE_DOMAIN],
    rules: deny(
      ["db", "module-public", "module-private"],
      "Domain logic must stay pure: no database, no services, no I/O.",
    ),
  },
  globalIgnores([
    "public/pdfjs/**",
    ".data/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/server/platform/db/migrations/**",
  ]),
]);

export default eslintConfig;
