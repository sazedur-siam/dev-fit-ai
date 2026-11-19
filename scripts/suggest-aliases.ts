/**
 * Suggest new lines for the alias table in src/lib/skills.ts.
 *
 *   npm run suggest-aliases               # threshold 0.9
 *   npm run suggest-aliases -- 0.85       # looser
 *
 * Collects every skill name DevFit has seen (requirement stacks in saved
 * analyses, developer frameworks and languages), embeds them with Gemini, and
 * prints unrecognised spellings that sit very close to a different known one.
 * Review each line before pasting it into ALIASES: embeddings put "React" and
 * "Preact" close together too. Nothing here runs at request time.
 *
 * Needs MONGODB_URI and GEMINI_API_KEY (reads .env.local / .env).
 */
import { suggestAliases } from "@/lib/aliasSuggest";
import { GEMINI_EMBEDDING_MODEL } from "@/lib/config";
import { geminiEmbed } from "@/lib/gemini";
import { COLLECTIONS, getDb, getMongoClient } from "@/lib/mongodb";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // file absent: fine
  }
}

async function main(): Promise<number> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!process.env.MONGODB_URI || !key) {
    console.log("Skipped: set MONGODB_URI and GEMINI_API_KEY.");
    return 0;
  }
  const threshold = Number(process.argv[2] ?? "0.9");
  if (!(threshold > 0 && threshold <= 1)) {
    console.error(`Threshold must be between 0 and 1, got ${process.argv[2]}`);
    return 1;
  }

  // Probe first: model names rot, and a clear message beats a 404 mid-run.
  try {
    await geminiEmbed(["probe"], key);
  } catch (err) {
    console.error(
      `Embedding model "${GEMINI_EMBEDDING_MODEL}" didn't work: ${err instanceof Error ? err.message : err}\n` +
        "Set GEMINI_EMBEDDING_MODEL to a current embedding model and retry."
    );
    return 1;
  }

  const db = await getDb();
  const [analyses, developers] = await Promise.all([
    db.collection(COLLECTIONS.analyses).find({}, { projection: { "requirement.stack": 1 } }).toArray(),
    db.collection(COLLECTIONS.developers).find({}, { projection: { repos: 1 } }).toArray(),
  ]);
  const names = new Set<string>();
  for (const a of analyses) for (const s of a.requirement?.stack ?? []) names.add(String(s));
  for (const d of developers) {
    for (const r of d.repos ?? []) {
      for (const s of [...(r.frameworks ?? []), ...(r.languages ?? [])]) names.add(String(s));
    }
  }
  console.log(`${names.size} distinct skill names; embedding with ${GEMINI_EMBEDDING_MODEL}…`);

  const suggestions = await suggestAliases([...names], (texts) => geminiEmbed(texts, key), threshold);
  if (suggestions.length === 0) {
    console.log(`No suggestions at ${threshold}. The alias table already covers what's been seen.`);
    return 0;
  }
  console.log(`\n${suggestions.length} suggestion(s). Review, then paste the good ones into ALIASES:\n`);
  for (const s of suggestions) {
    console.log(`  ${s.line.padEnd(40)} // "${s.from}" ≈ "${s.to}" (${s.similarity})`);
  }
  return 0;
}

async function closeDb() {
  if (!process.env.MONGODB_URI) return;
  try {
    await (await getMongoClient()).close();
  } catch {
    // never connected
  }
}

main()
  .then(async (code) => {
    await closeDb();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error("suggest-aliases crashed:", err);
    await closeDb();
    process.exit(1);
  });
