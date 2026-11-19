import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

// drizzle-kit expands these as globs, which need forward slashes on Windows.
const at = (relative: string) =>
  path.join(__dirname, relative).replaceAll("\\", "/");

export default defineConfig({
  // Both barrels. The module files are listed as well because the modules
  // barrel exports namespaces, and drizzle-kit only reads top-level tables.
  schema: [
    at("./src/schema/index.ts"),
    at("./src/modules/index.ts"),
    at("./src/modules/*.ts"),
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
