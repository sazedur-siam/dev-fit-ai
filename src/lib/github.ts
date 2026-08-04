import { DIGEST_LIMITS } from "@/lib/config";

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

function ghHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "devfit-hackathon",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  return headers;
}

async function gh<T>(path: string): Promise<T> {
  const res = await fetch(`${GH_BASE}${path}`, { headers: ghHeaders() });
  if (!res.ok) {
    const body = await res.text();
    throw new GitHubError(
      `GitHub ${res.status} ${res.statusText} — ${body.slice(0, 200)}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
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
  branch: string,
  path: string
): Promise<string> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "devfit-hackathon",
      ...(process.env.GITHUB_TOKEN
        ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
        : {}),
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
 * Build the repo digest string sent to Gemini for analysis. See spec Step 1.
 */
export async function buildRepoDigest(repoUrl: string): Promise<RepoDigest> {
  const { owner, repo } = parseRepoUrl(repoUrl);

  const meta = await gh<{ default_branch: string; description?: string | null }>(
    `/repos/${owner}/${repo}`
  );
  const defaultBranch = meta.default_branch;

  const tree = await gh<{ tree: GitHubTreeEntry[]; truncated?: boolean }>(
    `/repos/${owner}/${repo}/git/trees/${defaultBranch}?recursive=1`
  );

  const kept = tree.tree.filter((e) => !isIgnoredPath(e.path));
  const shownTree = kept.slice(0, DIGEST_LIMITS.maxTreePaths);
  const treeListing = shownTree
    .map((e) => `${e.type === "tree" ? "d" : "f"} ${e.path}`)
    .join("\n");

  const picks = pickInterestingFiles(kept);
  const filesInlined: { path: string; content: string }[] = [];
  for (const p of picks) {
    const content = await fetchRawFile(owner, repo, defaultBranch, p.path);
    if (content) filesInlined.push({ path: p.path, content });
  }

  let languageBytes: Record<string, number> = {};
  try {
    languageBytes = await gh<Record<string, number>>(
      `/repos/${owner}/${repo}/languages`
    );
  } catch {
    languageBytes = {};
  }

  const header = `# Repo: ${owner}/${repo}
Default branch: ${defaultBranch}
Description: ${meta.description || "(none)"}
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
