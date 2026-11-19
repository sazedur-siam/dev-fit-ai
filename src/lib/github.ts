import { DIGEST_LIMITS } from "@/lib/config";
import type { ViewerRepo, ViewerRepoList } from "@/lib/types";

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  ".next",
  "out",
  ".git",
  ".turbo",
  "coverage",
  "vendor",
  ".venv",
  "__pycache__",
]);

const IGNORED_FILE_PATTERNS = [
  /\.lock$/,
  /-lock\.json$/,
  /\.min\.(js|css)$/,
  /\.(png|jpg|jpeg|gif|svg|webp|ico|pdf|zip|gz|woff2?|ttf|otf|mp3|mp4|mov|wav|eot)$/i,
];

const CONFIG_FILE_HINTS = [
  "package.json",
  "composer.json",
  "requirements.txt",
  "pyproject.toml",
  "poetry.lock",
  "go.mod",
  "cargo.toml",
  "gemfile",
  "next.config.mjs",
  "next.config.js",
  "tsconfig.json",
  "dockerfile",
  "docker-compose.yml",
  "vite.config.ts",
  "vite.config.js",
  "tailwind.config.ts",
  "tailwind.config.js",
  "app/module.xml", // magento
  "wp-content/plugins", // wordpress hint
  "manage.py", // django
  ".magento/",
];

const README_HINTS = ["readme.md", "readme", "readme.rst"];

export interface RepoDigest {
  owner: string;
  repo: string;
  defaultBranch: string;
  digest: string;
  fileCount: number;
  languageBytes: Record<string, number>;
}

/** Where a repo's default branch currently points, plus what the digest needs. */
export interface RepoHead {
  defaultBranch: string;
  /** Commit SHA the default branch points at. The digest is built at this SHA. */
  sha: string;
  description: string | null;
  isPrivate: boolean;
}

interface GitHubTreeEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
  sha: string;
}

class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GitHubError";
  }
}

const GH_BASE = "https://api.github.com";

/**
 * The token is threaded through every call rather than read from the environment:
 * each signed-in user stores their own, so there is no ambient token to reach for.
 * Passing nothing is valid — GitHub allows 60 unauthenticated requests/hour.
 */
function ghHeaders(token?: string | null): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devfit",
  };
  const trimmed = token?.trim();
  if (trimmed) {
    (headers as Record<string, string>).Authorization = `Bearer ${trimmed}`;
  }
  return headers;
}

async function ghFetch(
  path: string,
  token?: string | null,
  accept?: string
): Promise<Response> {
  const headers = ghHeaders(token) as Record<string, string>;
  if (accept) headers.Accept = accept;
  const res = await fetch(`${GH_BASE}${path}`, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new GitHubError(
      `GitHub ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
      res.status
    );
  }
  return res;
}

async function gh<T>(path: string, token?: string | null): Promise<T> {
  return (await ghFetch(path, token)).json() as Promise<T>;
}

/**
 * Run `fn` over `items` at most `size` at a time, keeping input order in the
 * output. Used for raw file reads: all-at-once would trip GitHub's secondary
 * rate limit on big digests, one-at-a-time was the main latency cost.
 */
export async function mapInBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

const FILE_FETCH_CONCURRENCY = 5;

interface GitHubRepoPayload {
  full_name: string;
  name: string;
  owner: { login: string };
  description: string | null;
  language: string | null;
  private: boolean;
  fork: boolean;
  html_url: string;
  updated_at: string;
  pushed_at?: string;
  stargazers_count: number;
}

const REPO_PAGE_SIZE = 100;
const REPO_MAX_PAGES = 3; // up to 300 repos — plenty, and bounds the rate-limit cost

/**
 * Repositories the configured GITHUB_TOKEN can see, newest-push first.
 *
 * This is deliberately token-scoped rather than user-scoped: there is no auth in
 * this app, so "the current user" means "whoever owns GITHUB_TOKEN". A
 * fine-grained token only ever returns what it was granted — a
 * public-repos-read-only token will not list private repos, and that is the
 * token's doing, not a bug here.
 */
export async function listViewerRepos(
  token: string | null | undefined
): Promise<ViewerRepoList> {
  if (!token?.trim()) {
    throw new GitHubError(
      "No GitHub token available, so there is no account to list repositories for. Add one on the Settings page, or set GITHUB_TOKEN in .env.local.",
      401
    );
  }

  const viewer = await gh<{ login: string }>("/user", token);

  const repos: ViewerRepo[] = [];
  for (let page = 1; page <= REPO_MAX_PAGES; page += 1) {
    const batch = await gh<GitHubRepoPayload[]>(
      `/user/repos?per_page=${REPO_PAGE_SIZE}&page=${page}&sort=pushed&affiliation=owner,collaborator,organization_member`,
      token
    );
    repos.push(
      ...batch.map((r) => ({
        fullName: r.full_name,
        name: r.name,
        owner: r.owner?.login ?? "",
        description: r.description,
        language: r.language,
        isPrivate: r.private,
        isFork: r.fork,
        htmlUrl: r.html_url,
        updatedAt: r.pushed_at || r.updated_at,
        stars: r.stargazers_count ?? 0,
      }))
    );
    if (batch.length < REPO_PAGE_SIZE) break;
  }

  return { login: viewer.login, repos };
}

/** Parse `https://github.com/owner/repo(.git)?(/...)?` → { owner, repo }. */
export function parseRepoUrl(input: string): { owner: string; repo: string } {
  const trimmed = input.trim();
  const m = trimmed.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:\.git)?\/?/i
  );
  if (!m) throw new Error(`Not a valid GitHub URL: ${input}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/i, "") };
}

function isIgnoredPath(p: string): boolean {
  const parts = p.split("/");
  if (parts.some((seg) => IGNORED_DIRS.has(seg))) return true;
  const leaf = parts[parts.length - 1].toLowerCase();
  return IGNORED_FILE_PATTERNS.some((rx) => rx.test(leaf));
}

function pickInterestingFiles(entries: GitHubTreeEntry[]): GitHubTreeEntry[] {
  const blobs = entries.filter(
    (e) => e.type === "blob" && !isIgnoredPath(e.path)
  );
  const scored = blobs
    .map((e) => ({
      entry: e,
      score: scoreFile(e),
    }))
    .sort((a, b) => b.score - a.score);

  const picked: GitHubTreeEntry[] = [];
  for (const { entry } of scored) {
    if (picked.length >= DIGEST_LIMITS.maxInlinedFiles) break;
    picked.push(entry);
  }
  return picked;
}

function scoreFile(e: GitHubTreeEntry): number {
  const path = e.path.toLowerCase();
  const leaf = path.split("/").pop() || "";
  let score = 0;
  if (CONFIG_FILE_HINTS.some((h) => path.includes(h))) score += 100;
  if (README_HINTS.some((h) => leaf === h)) score += 90;
  if (path.startsWith("src/") || path.startsWith("app/")) score += 10;
  if (
    leaf.endsWith(".ts") ||
    leaf.endsWith(".tsx") ||
    leaf.endsWith(".js") ||
    leaf.endsWith(".jsx") ||
    leaf.endsWith(".py") ||
    leaf.endsWith(".php") ||
    leaf.endsWith(".go") ||
    leaf.endsWith(".rs") ||
    leaf.endsWith(".rb") ||
    leaf.endsWith(".java") ||
    leaf.endsWith(".cs")
  ) {
    score += 5;
  }
  // Prefer smaller files — they're usually more informative than 40k-line dumps.
  const size = e.size ?? 0;
  if (size > 0 && size < DIGEST_LIMITS.maxFileBytes) score += 8;
  if (size > DIGEST_LIMITS.maxFileBytes * 4) score -= 20;
  return score;
}

async function fetchRawFile(
  owner: string,
  repo: string,
  ref: string, // branch name or commit SHA
  path: string,
  token?: string | null
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "devfit",
      ...(token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}),
    },
  });
  if (!res.ok) return "";
  const text = await res.text();
  if (text.length <= DIGEST_LIMITS.maxFileBytes) return text;
  return `${text.slice(0, DIGEST_LIMITS.maxFileBytes)}\n\n/* … truncated at ${
    DIGEST_LIMITS.maxFileBytes
  } bytes … */`;
}

/**
 * Two cheap calls: repo metadata, then the default branch's head commit SHA
 * (the `sha` media type returns just the 40-char string). The SHA is the cache
 * key for the digest, and pins every later read to one snapshot.
 */
export async function getRepoHead(
  owner: string,
  repo: string,
  token?: string | null
): Promise<RepoHead> {
  const meta = await gh<{
    default_branch: string;
    description?: string | null;
    private?: boolean;
  }>(`/repos/${owner}/${repo}`, token);
  const shaRes = await ghFetch(
    `/repos/${owner}/${repo}/commits/${meta.default_branch}`,
    token,
    "application/vnd.github.sha"
  );
  const sha = (await shaRes.text()).trim();
  return {
    defaultBranch: meta.default_branch,
    sha,
    description: meta.description ?? null,
    // Unknown counts as private: the safe side for caching decisions.
    isPrivate: meta.private !== false,
  };
}

/**
 * Build the repo digest string sent to Gemini for analysis. See spec Step 1.
 * Everything is read at `head.sha`, not the branch name, so a push landing
 * mid-build can't mix two versions of the repo.
 */
export async function buildRepoDigest(
  owner: string,
  repo: string,
  head: RepoHead,
  token?: string | null
): Promise<RepoDigest> {
  const { defaultBranch, sha } = head;

  const [tree, languageBytes] = await Promise.all([
    gh<{ tree: GitHubTreeEntry[]; truncated?: boolean }>(
      `/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`,
      token
    ),
    gh<Record<string, number>>(`/repos/${owner}/${repo}/languages`, token).catch(
      () => ({}) as Record<string, number>
    ),
  ]);

  const kept = tree.tree.filter((e) => !isIgnoredPath(e.path));
  const shownTree = kept.slice(0, DIGEST_LIMITS.maxTreePaths);
  const treeListing = shownTree
    .map((e) => `${e.type === "tree" ? "d" : "f"} ${e.path}`)
    .join("\n");

  const picks = pickInterestingFiles(kept);
  const fetched = await mapInBatches(picks, FILE_FETCH_CONCURRENCY, async (p) => ({
    path: p.path,
    content: await fetchRawFile(owner, repo, sha, p.path, token),
  }));
  const filesInlined = fetched.filter((f) => f.content.length > 0);

  const header = `# Repo: ${owner}/${repo}
Default branch: ${defaultBranch}
Description: ${head.description || "(none)"}
Language bytes: ${JSON.stringify(languageBytes)}
`;

  const treeBlock = `\n## File tree (first ${shownTree.length} of ${kept.length}${
    tree.truncated ? "+" : ""
  } paths)\n\`\`\`\n${treeListing}\n\`\`\`\n`;

  const filesBlock =
    filesInlined.length === 0
      ? "\n## Key files\n(no readable files inlined)\n"
      : `\n## Key files (${filesInlined.length})\n` +
        filesInlined
          .map(
            (f) =>
              `\n### ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n`
          )
          .join("\n");

  const digest = header + treeBlock + filesBlock;

  return {
    owner,
    repo,
    defaultBranch,
    digest,
    fileCount: filesInlined.length,
    languageBytes,
  };
}
