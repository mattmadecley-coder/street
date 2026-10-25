// A stable identifier for a question in a department's questions.md, derived
// from its own text rather than its position in the file. Positional IDs
// (the old `${department}:question:${index}`) silently point at a different
// question the moment an entry above it is answered/removed/reordered --
// exactly the kind of thing that makes a bookmark or a submitted answer
// land on the wrong question. Both the read side (lib/admin-hq.ts) and the
// write side (app/admin/hq/actions.ts) compute this the same way, so an
// answer submitted against one matches the other without any new field
// needing to round-trip through hq/_shared/dashboard.json.
import { createHash } from "crypto";

export function hqQuestionId(department: string, question: string): string {
  const hash = createHash("sha256").update(question.trim()).digest("hex").slice(0, 12);
  return `${department}:${hash}`;
}
