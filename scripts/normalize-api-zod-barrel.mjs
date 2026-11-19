import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const barrel = path.join(root, "lib", "api-zod", "src", "index.ts");
const generated = path.join(root, "lib", "api-zod", "src", "generated");
const typesDir = path.join(generated, "types");
const schemas = await readFile(path.join(generated, "api.ts"), "utf8");
const schemaNames = new Set(
  [...schemas.matchAll(/export const (\w+)/g)].map((match) => match[1]),
);
const typeExports = [];

for (const filename of (await readdir(typesDir)).filter(
  (name) => name.endsWith(".ts") && name !== "index.ts",
)) {
  const contents = await readFile(path.join(typesDir, filename), "utf8");
  for (const match of contents.matchAll(/export (?:type|interface) (\w+)/g)) {
    const name = match[1];
    if (!schemaNames.has(name)) {
      typeExports.push(
        `export type { ${name} } from "./generated/types/${filename.slice(0, -3)}";`,
      );
    }
  }
}

await writeFile(
  barrel,
  [
    'export * from "./generated/api";',
    'export * as ApiTypes from "./generated/types";',
    ...typeExports.sort(),
    "",
  ].join("\n"),
  "utf8",
);
