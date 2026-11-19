/**
 * Frameworks a repository uses, read from its dependency manifests. Pure and
 * deterministic: a fixed dependency → framework table, no model calls.
 *
 * Display names here are what developers see on their profile; scoring compares
 * them through `canonicalSkill()`, so they only need to be recognisable.
 */

export interface Manifests {
  packageJson?: string | null;
  requirementsTxt?: string | null;
  pyproject?: string | null;
  composerJson?: string | null;
  goMod?: string | null;
  gemfile?: string | null;
}

/** npm package name → framework. Exact names, plus `@scope/` prefixes ending in "/". */
const NPM: Record<string, string> = {
  next: "Next.js",
  react: "React",
  vue: "Vue",
  nuxt: "Nuxt",
  "@angular/core": "Angular",
  svelte: "Svelte",
  "@sveltejs/kit": "SvelteKit",
  "@remix-run/react": "Remix",
  gatsby: "Gatsby",
  express: "Express",
  "@nestjs/core": "NestJS",
  fastify: "Fastify",
  "@trpc/server": "tRPC",
  prisma: "Prisma",
  "@prisma/client": "Prisma",
  graphql: "GraphQL",
  "@apollo/client": "Apollo",
  "@apollo/server": "Apollo",
  tailwindcss: "Tailwind CSS",
  zustand: "Zustand",
  "@reduxjs/toolkit": "Redux",
  redux: "Redux",
  "react-hook-form": "React Hook Form",
  "@tanstack/react-query": "TanStack Query",
  antd: "Ant Design",
  "@mui/material": "MUI",
  "styled-components": "styled-components",
  "@storybook/": "Storybook",
  bullmq: "BullMQ",
  mongoose: "MongoDB",
  mongodb: "MongoDB",
  pg: "PostgreSQL",
  mysql2: "MySQL",
  ioredis: "Redis",
  redis: "Redis",
  vite: "Vite",
  webpack: "webpack",
  gulp: "Gulp",
  knockout: "Knockout.js",
  jquery: "jQuery",
  "react-native": "React Native",
  electron: "Electron",
};

/** PyPI name (lowercased, `_` → `-`) → framework. */
const PYPI: Record<string, string> = {
  django: "Django",
  djangorestframework: "Django REST Framework",
  fastapi: "FastAPI",
  flask: "Flask",
  celery: "Celery",
  "psycopg2": "PostgreSQL",
  "psycopg2-binary": "PostgreSQL",
  psycopg: "PostgreSQL",
  sqlalchemy: "SQLAlchemy",
  langchain: "LangChain",
  pandas: "pandas",
  pytest: "pytest",
  redis: "Redis",
  pydantic: "Pydantic",
};

/** Composer name or `vendor/` prefix → framework. */
const COMPOSER: Record<string, string> = {
  "magento/": "Magento",
  "laravel/framework": "Laravel",
  "symfony/": "Symfony",
  "phpunit/phpunit": "PHPUnit",
  "johnpbloch/wordpress": "WordPress",
  "roots/wordpress": "WordPress",
  "wpackagist-plugin/": "WordPress",
  "woocommerce/": "WooCommerce",
};

const GO: Record<string, string> = {
  "github.com/gin-gonic/gin": "Gin",
  "github.com/labstack/echo": "Echo",
  "github.com/gofiber/fiber": "Fiber",
};

const RUBY: Record<string, string> = { rails: "Ruby on Rails", sinatra: "Sinatra" };

function lookup(table: Record<string, string>, name: string): string | undefined {
  if (table[name]) return table[name];
  for (const [key, framework] of Object.entries(table)) {
    if (key.endsWith("/") && name.startsWith(key)) return framework;
  }
  return undefined;
}

function safeJson(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const keysOf = (v: unknown) =>
  v && typeof v === "object" && !Array.isArray(v) ? Object.keys(v) : [];

function npmDeps(text: string | null | undefined): string[] {
  const pkg = safeJson(text);
  if (!pkg) return [];
  return [...keysOf(pkg.dependencies), ...keysOf(pkg.devDependencies), ...keysOf(pkg.peerDependencies)];
}

const normalizePy = (name: string) => name.trim().toLowerCase().replace(/_/g, "-");

function requirementsDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line && !line.startsWith("-"))
    .map((line) => normalizePy(line.split(/[<>=!~;\[\s]/)[0]));
}

/** Names in pyproject `dependencies = [...]` lists and Poetry dependency tables. */
function pyprojectDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const m of text.matchAll(/["']([A-Za-z0-9_.-]+)\s*(?:\[[^\]]*\])?\s*(?:[<>=!~;][^"']*)?["']/g)) {
    names.add(normalizePy(m[1]));
  }
  for (const m of text.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["{]/gm)) {
    names.add(normalizePy(m[1]));
  }
  return [...names];
}

function composerDeps(text: string | null | undefined): string[] {
  const c = safeJson(text);
  if (!c) return [];
  return [...keysOf(c.require), ...keysOf(c["require-dev"])].map((n) => n.toLowerCase());
}

function goDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/^\s*(?:require\s+)?([a-z0-9.\-]+\/[^\s]+)\s+v/gm)].map((m) =>
    m[1].replace(/\/v\d+$/, "")
  );
}

function gemDeps(text: string | null | undefined): string[] {
  if (!text) return [];
  return [...text.matchAll(/^\s*gem\s+["']([^"']+)["']/gm)].map((m) => m[1]);
}

/** Frameworks for one repository, in a stable order, deduplicated. */
export function detectFrameworks(m: Manifests): string[] {
  const found: string[] = [];
  const add = (fw: string | undefined) => {
    if (fw && !found.includes(fw)) found.push(fw);
  };
  for (const d of npmDeps(m.packageJson)) add(lookup(NPM, d));
  // A VS Code extension declares the editor version it targets instead of a framework.
  const engines = safeJson(m.packageJson)?.engines;
  if (engines && typeof engines === "object" && "vscode" in engines) add("VS Code Extension API");
  for (const d of [...requirementsDeps(m.requirementsTxt), ...pyprojectDeps(m.pyproject)]) {
    add(lookup(PYPI, d));
  }
  for (const d of composerDeps(m.composerJson)) add(lookup(COMPOSER, d));
  for (const d of goDeps(m.goMod)) add(lookup(GO, d));
  for (const d of gemDeps(m.gemfile)) add(lookup(RUBY, d));
  return found;
}
