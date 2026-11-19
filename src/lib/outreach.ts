import { geminiJSON } from "@/lib/gemini";
import { canonicalSkill, expandSkills } from "@/lib/skills";
import type { ResolvedCredentials } from "@/lib/credentials";
import type { DeveloperView, FitScore, RepoRequirement } from "@/lib/types";

/**
 * A first-contact email draft for one developer about one piece of work.
 *
 * The model only writes; it is handed a short list of facts and told to use
 * nothing else. Scores are never included in its input, and a deterministic check
 * (`mentionsNumbers`) catches any figure that slips into the text anyway. Drafts
 * are never sent: the PM edits, then copies or opens them in their own client.
 */

export type OutreachTone = "friendly" | "formal";

export interface OutreachDraft {
  subject: string;
  body: string;
  /** Things the PM should check before sending, e.g. a number in the text. */
  warnings: string[];
}

/** The only facts the model sees. No scores, no verdict wording. */
export function outreachFacts(dev: DeveloperView, requirement: RepoRequirement) {
  // Same direction as scoring: implications expand the developer's skills (DRF ⇒
  // Django), never the requirement's.
  const wanted = new Set([...requirement.languages, ...requirement.stack].map(canonicalSkill));
  const covers = (skill: string) => [...expandSkills([skill])].some((id) => wanted.has(id));
  const devSkills = [...dev.languages, ...dev.frameworks];
  const matchingSkills = devSkills.filter(covers);
  const relevantRepos = dev.repos
    .filter((r) => [...r.languages, ...(r.frameworks ?? [])].some(covers))
    .slice(0, 3)
    .map((r) => r.name);
  return {
    firstName: dev.name.split(/\s+/)[0] ?? dev.name,
    matchingSkills: [...new Set(matchingSkills)].slice(0, 6),
    relevantRepos,
    projectSummary: requirement.summary,
    projectDomain: requirement.domain,
  };
}

/**
 * Scores and percentages have no place in an email to the person being scored.
 * Flags "82", "82.5", "75%", "8/10", "90 points" and similar; years like 2026
 * and repo names are left alone.
 */
export function mentionsNumbers(text: string): boolean {
  return /(\b\d{1,3}(\.\d+)?\s*(%|percent|\/\s*(10|100)\b|points?\b|score))|(\bscor(e|ed|ing)\b[^.\n]{0,20}\b\d)/i.test(
    text
  );
}

export function buildOutreachPrompt(
  facts: ReturnType<typeof outreachFacts>,
  opts: { tone: OutreachTone; senderName: string | null; strict?: boolean }
): string {
  return `Write a short first-contact email from a project manager to a developer about a project.

Facts (use ONLY these, do not invent anything else):
${JSON.stringify(facts, null, 2)}

Rules:
- Tone: ${opts.tone === "formal" ? "formal and concise" : "warm, friendly and concise"}. 90–140 words.
- Address them as ${facts.firstName}.
- Mention the project in plain words and why their experience looks relevant: name at most two of the matching skills or repos.
- Do not mention scores, rankings, percentages, ratings or any evaluation. Do not invent dates, budgets, clients, rates or project names.
- End by asking whether they'd be open to a short chat. Sign off as ${opts.senderName ? JSON.stringify(opts.senderName) : '"[Your name]"'}.${
    opts.strict ? "\n- Your previous draft contained a number or score. Use NO numbers at all this time." : ""
  }

Return STRICTLY this JSON: { "subject": string, "body": string }`;
}

function coerceDraft(raw: unknown, facts: ReturnType<typeof outreachFacts>) {
  const r = (raw && typeof raw === "object" ? raw : {}) as { subject?: unknown; body?: unknown };
  const body = typeof r.body === "string" ? r.body.trim() : "";
  if (!body) throw new Error("Gemini returned an empty draft. Try again.");
  const subject =
    typeof r.subject === "string" && r.subject.trim()
      ? r.subject.trim()
      : `A ${facts.projectDomain} project you might like`;
  return { subject, body };
}

export async function draftOutreach(
  input: {
    dev: DeveloperView;
    requirement: RepoRequirement;
    score: Pick<FitScore, "verdict">;
    tone: OutreachTone;
    senderName: string | null;
  },
  creds: ResolvedCredentials
): Promise<OutreachDraft> {
  const facts = outreachFacts(input.dev, input.requirement);
  const ask = async (strict: boolean) =>
    coerceDraft(
      await geminiJSON<unknown>(
        buildOutreachPrompt(facts, { tone: input.tone, senderName: input.senderName, strict }),
        creds.geminiApiKey
      ),
      facts
    );

  let draft = await ask(false);
  if (mentionsNumbers(`${draft.subject}\n${draft.body}`)) draft = await ask(true);

  const warnings: string[] = [];
  if (mentionsNumbers(`${draft.subject}\n${draft.body}`)) {
    warnings.push("The draft mentions a number or score. Remove it before sending.");
  }
  if (input.score.verdict === "not fit") {
    warnings.push("DevFit rated this developer \"not fit\" for this work. Double-check before reaching out.");
  }
  return { ...draft, warnings };
}
