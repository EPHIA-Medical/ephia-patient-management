// Node ESM needs file extensions; the app's sources import "../constants" (a directory)
// and extensionless modules the way Vite resolves them. Tests register this hook
// before importing app modules. Not a test file itself (no .test. in its name).
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    const candidates = [base, base + ".js", base + ".jsx", base + "/index.js", base + "/index.jsx"];
    for (const c of candidates) {
      if (existsSync(c) && statSync(c).isFile()) return nextResolve(pathToFileURL(c).href, context);
    }
  }
  return nextResolve(specifier, context);
}
