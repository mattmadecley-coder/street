// Lets Node's test runner resolve the project's "@/..." import alias (see tsconfig paths).
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  // Tests never talk to a real database: the REST client is replaced by an in-memory stand-in.
  if (specifier === "@/lib/supabase-rest") {
    return nextResolve(pathToFileURL(path.join(root, "tests", "fakes", "supabase-rest.ts")).href, context);
  }
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2));
    const candidates = [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx"), base];
    for (const candidate of candidates) {
      if (existsSync(candidate) && statSync(candidate).isFile()) {
        return nextResolve(pathToFileURL(candidate).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
