import { AI_CONFIG_PATHS, detectAiTools } from "@/lib/aiFluency";
import { detectFrameworks, type Manifests } from "@/lib/frameworkDetect";
import { canonicalSkill } from "@/lib/skills";
import type { Archetype, DeveloperRepo, MockDeveloper } from "@/lib/types";

/**
 * Build a developer profile from someone's **public** GitHub activity.
 *
 * Three GraphQL calls (~8s on a busy account): the user, their repositories with
 * the commits they authored, then dependency manifests for the top repositories.
 * The repository and manifest queries are split on purpose. Combined, GitHub
 * timed out (HTTP 502 after ~11s) on an account with 20 repositories.
 *
 * Kept free of Next.js imports so a plain Node script (a scheduled refresh, for
 * instance) can call it.
 */

const GRAPHQL_URL = "https://api.github.com/graphql";
const REPO_SCAN = 15; // repositories inspected, most recently pushed first
const COMMIT_SAMPLE = 20; // commits per repository used for line counts and messages
const PROFILE_REPOS = 8; // repositories kept on the profile, most commits first
const MIN_LANGUAGE_SHARE = 0.05; // ignore languages under 5% of a repository

/** GitHub usernames: alphanumerics and single hyphens, at most 39 characters. */
export const GITHUB_LOGIN = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

export const githubDeveloperId = (login: string) => `gh-${login.toLowerCase()}`;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * When to re-import someone, from how recently they committed: active people
 * change fastest. Adapted from OMAV's 7/14/30-night tiers.
 */
export function nextRefreshDate(lastCommitAt: string | undefined, now: Date): Date {
  const ageDays = lastCommitAt
    ? (now.getTime() - new Date(lastCommitAt).getTime()) / DAY_MS
    : Infinity;
  const intervalDays = ageDays <= 30 ? 7 : ageDays <= 180 ? 14 : 30;
  return new Date(now.getTime() + intervalDays * DAY_MS);
}

let lastRateLimitRemaining: number | null = null;

/** GraphQL points left on the token, from the most recent response's headers. */
export function getRateLimitRemaining(): number | null {
  return lastRateLimitRemaining;
}

// ───────────────────────── GitHub payload shapes ─────────────────────────

export interface GhUser {
  id: string;
  login: string;
  name: string | null;
}

export interface GhCommit {
  messageHeadline: string;
  committedDate: string;
  additions: number;
  deletions: number;
}

export interface GhRepo {
  name: string;
  pushedAt: string | null;
  languages: { totalSize: number; edges: { size: number; node: { name: string } }[] };
  defaultBranchRef: {
    target: { history?: { totalCount: number; nodes: GhCommit[] } } | null;
  } | null;
}

// ───────────────────────── Pure mapping ─────────────────────────

const FRONTEND_LANGS = new Set(["css", "scss", "sass", "less", "html", "tsx", "vue", "svelte", "astro"]);
const BACKEND_LANGS = new Set([
  "python", "php", "go", "java", "kotlin", "ruby", "csharp", "c#", "rust", "scala",
  "elixir", "sql", "plpgsql", "tsql", "c", "c++", "cpp", "shell",
]);
const FRONTEND_FW = new Set(["react", "nextjs", "vue", "nuxt", "angular", "svelte", "sveltekit", "remix", "gatsby", "tailwindcss", "reactnative"]);
/** Backends written in JavaScript/TypeScript: these claim TS/JS bytes for the backend. */
const JS_BACKEND_FW = new Set(["express", "nestjs", "fastify", "trpc", "prisma", "bullmq"]);

/**
 * Frontend, backend or fullstack from where the bytes are. TypeScript and
 * JavaScript go either way, so they're attributed by the frameworks alongside:
 * to the frontend with React and friends, to the backend with Express/Nest/tRPC.
 * At least 70% on one side is a specialist; anything more mixed is fullstack.
 */
export function guessArchetype(
  languageBytes: Record<string, number>,
  frameworks: string[]
): Archetype {
  const fw = frameworks.map(canonicalSkill);
  const feFw = fw.some((f) => FRONTEND_FW.has(f));
  const jsBeFw = fw.some((f) => JS_BACKEND_FW.has(f));
  // A Python/PHP/Go backend (Django, Laravel…) doesn't claim the TypeScript; only
  // a JS backend framework does. With no signal either way, split it evenly.
  const jsToFrontend = jsBeFw ? (feFw ? 0.5 : 0) : feFw ? 1 : 0.5;

  let fe = 0;
  let be = 0;
  for (const [lang, bytes] of Object.entries(languageBytes)) {
    const id = lang.toLowerCase();
    if (FRONTEND_LANGS.has(id)) fe += bytes;
    else if (BACKEND_LANGS.has(id)) be += bytes;
    else if (id === "typescript" || id === "javascript") {
      fe += bytes * jsToFrontend;
      be += bytes * (1 - jsToFrontend);
    }
  }
  if (fe + be === 0) return "fullstack";
  const share = fe / (fe + be);
  if (share >= 0.7) return "frontend";
  if (share <= 0.3) return "backend";
  return "fullstack";
}

/**
 * Turn GitHub payloads into the same shape the seeded developers use. Pure, so
 * it's testable without a network.
 *
 * Line counts come from the sampled commits, scaled up to the repository's total
 * commit count by this author. They're an estimate, labelled as such in the UI.
 */
export function buildDeveloper(
  user: GhUser,
  repos: GhRepo[],
  manifestsByRepo: Record<string, Manifests>,
  opts: {
    archetype?: Archetype;
    now?: Date;
    /** AI tool ids per repo. When given, every profile repo gets an `aiTools` array. */
    aiToolsByRepo?: Record<string, string[]>;
  } = {}
): MockDeveloper {
  const languageBytes: Record<string, number> = {};
  const commits: GhCommit[] = [];

  const authored = repos
    .map((repo) => {
      const history = repo.defaultBranchRef?.target?.history;
      const total = history?.totalCount ?? 0;
      const sample = history?.nodes ?? [];
      const scale = sample.length > 0 ? total / sample.length : 0;
      const sum = (k: "additions" | "deletions") =>
        Math.round(sample.reduce((a, c) => a + (c[k] ?? 0), 0) * scale);

      const totalSize = repo.languages.totalSize || 1;
      const languages = repo.languages.edges
        .filter((e) => e.size / totalSize >= MIN_LANGUAGE_SHARE)
        .slice(0, 4)
        .map((e) => e.node.name);

      return { repo, total, sample, additions: sum("additions"), deletions: sum("deletions"), languages };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  for (const r of authored) {
    commits.push(...r.sample);
    // Weight each repo's languages by the lines this author added there.
    for (const e of r.repo.languages.edges) {
      const share = e.size / (r.repo.languages.totalSize || 1);
      languageBytes[e.node.name] = (languageBytes[e.node.name] ?? 0) + share * r.additions;
    }
  }

  const profileRepos: DeveloperRepo[] = authored.slice(0, PROFILE_REPOS).map((r) => ({
    name: r.repo.name,
    commits: r.total,
    additions: r.additions,
    deletions: r.deletions,
    languages: r.languages,
    frameworks: detectFrameworks(manifestsByRepo[r.repo.name] ?? {}),
    ...(opts.aiToolsByRepo ? { aiTools: opts.aiToolsByRepo[r.repo.name] ?? [] } : {}),
  }));

  const allFrameworks = [...new Set(profileRepos.flatMap((r) => r.frameworks ?? []))];
  const newestFirst = commits
    .slice()
    .sort((a, b) => b.committedDate.localeCompare(a.committedDate));
  const now = opts.now ?? new Date();
  const lastCommitAt = newestFirst[0]?.committedDate;
  const recentCommitMessages = [
    ...new Set(
      newestFirst
        .map((c) => c.messageHeadline.trim())
        .filter(Boolean)
    ),
  ].slice(0, 5);

  return {
    id: githubDeveloperId(user.login),
    name: user.name?.trim() || user.login,
    archetype: opts.archetype ?? guessArchetype(languageBytes, allFrameworks),
    totalCommits: authored.reduce((a, r) => a + r.total, 0),
    linesAdded: authored.reduce((a, r) => a + r.additions, 0),
    linesDeleted: authored.reduce((a, r) => a + r.deletions, 0),
    repos: profileRepos,
    recentCommitMessages,
    source: "github",
    githubLogin: user.login,
    importedAt: now.toISOString(),
    ...(lastCommitAt ? { lastCommitAt } : {}),
    nextRefreshAt: nextRefreshDate(lastCommitAt, now).toISOString(),
  };
}

// ───────────────────────── Network ─────────────────────────

/**
 * POST one GraphQL query. Throws `GitHub 4xx — …` for request errors so routes can
 * map them to a 400. Shared with githubInsights.ts so rate-limit tracking stays here.
 */
export async function githubGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  token: string
): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      "Content-Type": "application/json",
      "User-Agent": "devfit",
    },
    body: JSON.stringify({ query, variables }),
  });
  const remaining = Number(res.headers.get("x-ratelimit-remaining"));
  if (Number.isFinite(remaining) && res.headers.has("x-ratelimit-remaining")) {
    lastRateLimitRemaining = remaining;
  }
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${res.statusText} — GraphQL request failed`);
  }
  const body = (await res.json()) as { data?: T; errors?: { message: string; type?: string }[] };
  if (body.errors?.length) {
    const notFound = body.errors.some((e) => e.type === "NOT_FOUND");
    throw new Error(`GitHub ${notFound ? 404 : 400} — ${body.errors[0].message}`);
  }
  if (!body.data) throw new Error("GitHub returned no data");
  return body.data;
}

const USER_QUERY = `query ($login: String!) { user(login: $login) { id login name } }`;

const REPOS_QUERY = `query ($login: String!, $authorId: ID!) {
  user(login: $login) {
    repositories(first: ${REPO_SCAN}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
                 orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name
        pushedAt
        languages(first: 8, orderBy: {field: SIZE, direction: DESC}) {
          totalSize
          edges { size node { name } }
        }
        defaultBranchRef {
          target {
            ... on Commit {
              history(first: ${COMMIT_SAMPLE}, author: {id: $authorId}) {
                totalCount
                nodes { messageHeadline committedDate additions deletions }
              }
            }
          }
        }
      }
    }
  }
}`;

const MANIFEST_FILES: Record<keyof Manifests, string> = {
  packageJson: "package.json",
  requirementsTxt: "requirements.txt",
  pyproject: "pyproject.toml",
  composerJson: "composer.json",
  goMod: "go.mod",
  gemfile: "Gemfile",
};

/**
 * One aliased query for every repo's manifests (text) and AI-tool config files
 * (presence only, aliased ai0…aiN in AI_CONFIG_PATHS order). Repo names go in as
 * variables. ~3.3s for 8 repos measured against GitHub.
 */
function manifestQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$r${i}: String!`).join(", ");
  const fields = [
    ...Object.entries(MANIFEST_FILES).map(
      ([key, file]) => `${key}: object(expression: "HEAD:${file}") { ... on Blob { text } }`
    ),
    ...AI_CONFIG_PATHS.map(
      (path, i) => `ai${i}: object(expression: "HEAD:${path}") { __typename }`
    ),
  ].join(" ");
  const repos = Array.from(
    { length: count },
    (_, i) => `r${i}: repository(owner: $owner, name: $r${i}) { ${fields} }`
  ).join("\n");
  return `query ($owner: String!, ${vars}) {\n${repos}\n}`;
}

/** The exact query strings sent, exposed so they can be checked against GitHub. */
export const GITHUB_QUERIES = { user: USER_QUERY, repos: REPOS_QUERY, manifests: manifestQuery };

type BlobField = { text?: string } | null;

/**
 * Fetch and build a developer from GitHub. Throws `GitHub 4xx — …` for a bad or
 * unknown login, which route handlers map to a 400.
 */
export async function fetchGithubDeveloper(
  login: string,
  token: string,
  opts: { archetype?: Archetype } = {}
): Promise<MockDeveloper> {
  if (!GITHUB_LOGIN.test(login)) {
    throw new Error(`GitHub 400 — "${login}" isn't a valid GitHub username`);
  }

  const { user } = await githubGraphql<{ user: GhUser | null }>(USER_QUERY, { login }, token);
  if (!user) throw new Error(`GitHub 404 — no GitHub user named "${login}"`);

  const reposData = await githubGraphql<{ user: { repositories: { nodes: GhRepo[] } } }>(
    REPOS_QUERY,
    { login: user.login, authorId: user.id },
    token
  );
  const repos = reposData.user.repositories.nodes;

  const top = repos
    .filter((r) => (r.defaultBranchRef?.target?.history?.totalCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.defaultBranchRef?.target?.history?.totalCount ?? 0) -
        (a.defaultBranchRef?.target?.history?.totalCount ?? 0)
    )
    .slice(0, PROFILE_REPOS);

  const manifestsByRepo: Record<string, Manifests> = {};
  const aiToolsByRepo: Record<string, string[]> = {};
  if (top.length > 0) {
    const variables: Record<string, string> = { owner: user.login };
    top.forEach((r, i) => (variables[`r${i}`] = r.name));
    const data = await githubGraphql<Record<string, Record<string, BlobField> | null>>(
      manifestQuery(top.length),
      variables,
      token
    );
    top.forEach((r, i) => {
      const blobs = data[`r${i}`];
      if (!blobs) return;
      manifestsByRepo[r.name] = Object.fromEntries(
        Object.keys(MANIFEST_FILES).map((k) => [k, blobs[k]?.text ?? null])
      ) as Manifests;
      aiToolsByRepo[r.name] = detectAiTools(
        new Set(AI_CONFIG_PATHS.filter((_, j) => blobs[`ai${j}`]))
      );
    });
  }

  return buildDeveloper(user, repos, manifestsByRepo, { ...opts, aiToolsByRepo });
}
