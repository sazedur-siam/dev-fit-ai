import { GITHUB_LOGIN, githubGraphql } from "@/lib/githubProfile";
import type {
  ContributionDay,
  GithubProfileInsights,
  OssContribution,
  RepoDetail,
} from "@/lib/types";

/**
 * The Profile Analyzer's extra view of a GitHub account: identity, reputation,
 * last-year activity, contributions to other people's projects and repository
 * details. One GraphQL call (~1.5s, ~3.7s on a very busy account), run in
 * parallel with `fetchGithubDeveloper()`, which supplies commits, stack and AI
 * fluency.
 *
 * Repository details are fetched here rather than by widening the import's
 * repository query, which is already the slow one (it samples commits) and is
 * shared with the nightly refresh. Same selection and order, so names line up.
 *
 * Kept free of Next.js imports, like githubProfile.ts.
 */

const OSS_SAMPLE = 50; // most recent merged PRs inspected for outside contributions
const STAR_REPOS = 100; // own repos summed for stars, most-starred first
const DETAIL_REPOS = 15; // must match REPO_SCAN in githubProfile.ts

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ───────────────────────── GitHub payload shape ─────────────────────────

interface GhRepoRef {
  nameWithOwner: string;
  url: string;
  stargazerCount: number;
  isPrivate: boolean;
  owner: { login: string };
}

export interface GhProfile {
  login: string;
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  websiteUrl: string | null;
  twitterUsername: string | null;
  avatarUrl: string | null;
  url: string;
  createdAt: string;
  followers: { totalCount: number };
  following: { totalCount: number };
  organizations: { nodes: ({ login: string; name: string | null; url: string } | null)[] };
  pinnedItems: {
    nodes: ({
      nameWithOwner?: string;
      description?: string | null;
      url?: string;
      stargazerCount?: number;
      isPrivate?: boolean;
      primaryLanguage?: { name: string } | null;
    } | null)[];
  };
  ownedRepos: { totalCount: number; nodes: ({ stargazerCount: number; forkCount: number } | null)[] };
  recentRepos: {
    nodes: ({
      name: string;
      url: string;
      description: string | null;
      stargazerCount: number;
      forkCount: number;
      isArchived: boolean;
      pushedAt: string | null;
      licenseInfo: { spdxId: string | null } | null;
      repositoryTopics: { nodes: ({ topic: { name: string } } | null)[] };
    } | null)[];
  };
  contributionsCollection: {
    totalCommitContributions: number;
    totalPullRequestContributions: number;
    totalIssueContributions: number;
    totalPullRequestReviewContributions: number;
    restrictedContributionsCount: number;
    contributionCalendar: {
      totalContributions: number;
      weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
    };
  };
  pullRequests: {
    totalCount: number;
    nodes: ({ title: string; url: string; mergedAt: string | null; repository: GhRepoRef | null } | null)[];
  };
}

// ───────────────────────── Pure mapping ─────────────────────────

/** A bare `example.com` gets https; `javascript:` and friends are dropped. */
export function safeWebsite(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Active days, the longest run, the run ending today (or yesterday), busiest weekday. */
export function calendarStats(days: ContributionDay[]) {
  let longest = 0;
  let run = 0;
  let active = 0;
  const byWeekday = new Array<number>(7).fill(0);
  for (const d of days) {
    if (d.count > 0) {
      active++;
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
    byWeekday[new Date(`${d.date}T00:00:00Z`).getUTCDay()] += d.count;
  }

  // Today usually has no contributions yet; that shouldn't zero a live streak.
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  let current = 0;
  for (; i >= 0 && days[i].count > 0; i--) current++;

  const max = Math.max(...byWeekday);
  return {
    activeDays: active,
    longestStreak: longest,
    currentStreak: current,
    busiestWeekday: max > 0 ? WEEKDAYS[byWeekday.indexOf(max)] : null,
  };
}

/**
 * Merged PRs to repositories the developer doesn't own, grouped per repository.
 * **Private repositories are dropped**: the query runs with the requester's
 * token, which may see private repos the report should not name.
 */
export function ossContributions(login: string, prs: GhProfile["pullRequests"]["nodes"]): OssContribution[] {
  const me = login.toLowerCase();
  const byRepo = new Map<string, OssContribution>();
  for (const pr of prs) {
    const repo = pr?.repository;
    if (!pr || !repo || repo.isPrivate || repo.owner.login.toLowerCase() === me) continue;
    const entry = byRepo.get(repo.nameWithOwner);
    if (entry) {
      entry.mergedCount++;
      if (pr.mergedAt && (!entry.lastMergedAt || pr.mergedAt > entry.lastMergedAt)) {
        entry.lastMergedAt = pr.mergedAt;
        entry.example = pr.title;
      }
    } else {
      byRepo.set(repo.nameWithOwner, {
        repo: repo.nameWithOwner,
        url: repo.url,
        stars: repo.stargazerCount,
        mergedCount: 1,
        lastMergedAt: pr.mergedAt,
        example: pr.title,
      });
    }
  }
  return [...byRepo.values()].sort((a, b) => b.mergedCount - a.mergedCount || b.stars - a.stars);
}

/** Turn the profile payload into report insights. Pure, so it's testable offline. */
export function buildProfileInsights(p: GhProfile, now: Date = new Date()): GithubProfileInsights {
  const calendar: ContributionDay[] = p.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const c = p.contributionsCollection;
  const owned = p.ownedRepos.nodes.filter((n) => n !== null);
  const oss = ossContributions(p.login, p.pullRequests.nodes);

  const repoDetails: RepoDetail[] = p.recentRepos.nodes
    .filter((r) => r !== null)
    .map((r) => ({
      name: r.name,
      url: r.url,
      description: r.description?.trim() || null,
      stars: r.stargazerCount,
      forks: r.forkCount,
      topics: r.repositoryTopics.nodes.flatMap((t) => (t ? [t.topic.name] : [])),
      license: r.licenseInfo?.spdxId && r.licenseInfo.spdxId !== "NOASSERTION" ? r.licenseInfo.spdxId : null,
      isArchived: r.isArchived,
      pushedAt: r.pushedAt,
    }));

  return {
    login: p.login,
    name: p.name?.trim() || null,
    avatarUrl: p.avatarUrl,
    url: p.url,
    bio: p.bio?.trim() || null,
    company: p.company?.trim() || null,
    location: p.location?.trim() || null,
    websiteUrl: safeWebsite(p.websiteUrl),
    twitter: p.twitterUsername?.trim() || null,
    createdAt: p.createdAt,
    accountAgeYears:
      Math.round(((now.getTime() - new Date(p.createdAt).getTime()) / (365.25 * DAY_MS)) * 10) / 10,
    followers: p.followers.totalCount,
    following: p.following.totalCount,
    publicRepos: p.ownedRepos.totalCount,
    starsEarned: owned.reduce((a, r) => a + r.stargazerCount, 0),
    forksEarned: owned.reduce((a, r) => a + r.forkCount, 0),
    organizations: p.organizations.nodes.flatMap((o) =>
      o ? [{ login: o.login, name: o.name?.trim() || null, url: o.url }] : []
    ),
    pinned: p.pinnedItems.nodes.flatMap((n) =>
      n?.nameWithOwner && n.url && !n.isPrivate
        ? [
            {
              nameWithOwner: n.nameWithOwner,
              url: n.url,
              description: n.description?.trim() || null,
              stars: n.stargazerCount ?? 0,
              language: n.primaryLanguage?.name ?? null,
            },
          ]
        : []
    ),
    activity: {
      totalContributions: c.contributionCalendar.totalContributions,
      commits: c.totalCommitContributions,
      pullRequests: c.totalPullRequestContributions,
      issues: c.totalIssueContributions,
      reviews: c.totalPullRequestReviewContributions,
      privateContributions: c.restrictedContributionsCount,
      ...calendarStats(calendar),
      calendar,
    },
    openSource: {
      sampled: p.pullRequests.nodes.filter(Boolean).length,
      externalMerged: oss.reduce((a, r) => a + r.mergedCount, 0),
      repos: oss,
    },
    repoDetails,
  };
}

// ───────────────────────── Network ─────────────────────────

const PROFILE_QUERY = `query ($login: String!) {
  user(login: $login) {
    login name bio company location websiteUrl twitterUsername avatarUrl url createdAt
    followers { totalCount }
    following { totalCount }
    organizations(first: 10) { nodes { login name url } }
    pinnedItems(first: 6, types: REPOSITORY) {
      nodes { ... on Repository { nameWithOwner description url stargazerCount isPrivate primaryLanguage { name } } }
    }
    ownedRepos: repositories(first: ${STAR_REPOS}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
                             orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes { stargazerCount forkCount }
    }
    recentRepos: repositories(first: ${DETAIL_REPOS}, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC,
                              orderBy: {field: PUSHED_AT, direction: DESC}) {
      nodes {
        name url description stargazerCount forkCount isArchived pushedAt
        licenseInfo { spdxId }
        repositoryTopics(first: 5) { nodes { topic { name } } }
      }
    }
    contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions
      totalPullRequestReviewContributions restrictedContributionsCount
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
    }
    pullRequests(first: ${OSS_SAMPLE}, states: MERGED, orderBy: {field: CREATED_AT, direction: DESC}) {
      totalCount
      nodes { title url mergedAt repository { nameWithOwner url stargazerCount isPrivate owner { login } } }
    }
  }
}`;

/** The exact query sent, so it can be run by hand with `gh api graphql`. */
export const PROFILE_GRAPHQL = PROFILE_QUERY;

export async function fetchProfileInsights(login: string, token: string): Promise<GithubProfileInsights> {
  if (!GITHUB_LOGIN.test(login)) {
    throw new Error(`GitHub 400 — "${login}" isn't a valid GitHub username`);
  }
  const { user } = await githubGraphql<{ user: GhProfile | null }>(PROFILE_QUERY, { login }, token);
  if (!user) throw new Error(`GitHub 404 — no GitHub user named "${login}"`);
  return buildProfileInsights(user);
}
