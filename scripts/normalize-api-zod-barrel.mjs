import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const barrel = path.join(root, "lib", "api-zod", "src", "index.ts");

await writeFile(
  barrel,
  'export * from "./generated/api";\nexport * as ApiTypes from "./generated/types";\n',
  "utf8",
);
