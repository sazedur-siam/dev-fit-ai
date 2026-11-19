/**
 * Deterministic skill-name normalisation, so "Next.js App Router", "NextJS" and
 * "next" all compare equal. This is a plain lookup table, **never a model call**:
 * the scorer must give the same answer for the same input every time.
 *
 * To teach it a new spelling, add a line to ALIASES. Keys are *compacted* forms
 * (see `compact()`), values are canonical ids.
 */

/** Lowercase, drop "(…)" asides and trailing versions, strip spaces/dots/dashes. */
function compact(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/\s+v?\d+(\.\d+)*(\.x)?\s*$/, "") // "Magento 2", "Next.js 14", "Vue v3"
    .replace(/[\s._\-/]+/g, "");
}

const ALIASES: Record<string, string> = {
  // React ecosystem
  react: "react", reactjs: "react", reacthooks: "react",
  nextjs: "nextjs", next: "nextjs", nextjsapprouter: "nextjs", nextjspagesrouter: "nextjs",
  nextapprouter: "nextjs", approuter: "nextjs",
  remix: "remix", gatsby: "gatsby",
  reduxtoolkit: "redux", redux: "redux", zustand: "zustand",
  reacthookform: "reacthookform", reactquery: "tanstackquery", tanstackquery: "tanstackquery",
  storybook: "storybook",
  // Other front-end
  vue: "vue", vuejs: "vue", nuxt: "nuxt", nuxtjs: "nuxt",
  angular: "angular", angularjs: "angularjs", svelte: "svelte", sveltekit: "sveltekit",
  knockout: "knockout", knockoutjs: "knockout", jquery: "jquery", requirejs: "requirejs",
  // Styling
  tailwind: "tailwindcss", tailwindcss: "tailwindcss",
  antdesign: "antdesign", antd: "antdesign", mui: "mui", materialui: "mui",
  sass: "sass", scss: "sass", less: "less", styledcomponents: "styledcomponents",
  cssmodules: "cssmodules",
  // Node back-end
  node: "nodejs", nodejs: "nodejs", express: "express", expressjs: "express",
  nestjs: "nestjs", nest: "nestjs", fastify: "fastify", trpc: "trpc",
  prisma: "prisma", bullmq: "bullmq", graphql: "graphql", apollo: "apollo",
  apolloserver: "apollo", apolloclient: "apollo",
  // Python
  django: "django", djangorestframework: "drf", drf: "drf", djangorest: "drf",
  fastapi: "fastapi", flask: "flask", celery: "celery", pytest: "pytest",
  langchain: "langchain", pandas: "pandas",
  // PHP
  magento: "magento", magentocommerce: "magento", adobecommerce: "magento",
  wordpress: "wordpress", wp: "wordpress", woocommerce: "woocommerce",
  laravel: "laravel", symfony: "symfony", phpunit: "phpunit",
  // Data and infra
  postgres: "postgresql", postgresql: "postgresql", mysql: "mysql", mariadb: "mysql",
  mongodb: "mongodb", mongo: "mongodb", redis: "redis",
  docker: "docker", dockercompose: "docker", kubernetes: "kubernetes", k8s: "kubernetes",
  odoo: "odoo", rabbitmq: "rabbitmq", kafka: "kafka",
  // Build tools
  vite: "vite", webpack: "webpack", gulp: "gulp", turborepo: "turborepo",
};

/**
 * Knowing the left side means knowing the right: a Next.js developer writes
 * React, a DRF developer writes Django. Applied to the *developer's* skills only,
 * never to the requirement.
 */
const IMPLIES: Record<string, string[]> = {
  nextjs: ["react"],
  remix: ["react"],
  gatsby: ["react"],
  nuxt: ["vue"],
  sveltekit: ["svelte"],
  drf: ["django"],
  nestjs: ["nodejs"],
  express: ["nodejs"],
  fastify: ["nodejs"],
  woocommerce: ["wordpress"],
};

/** Canonical id for a skill name. Unknown names fall back to their compact form. */
export function canonicalSkill(raw: string): string {
  const key = compact(raw);
  return ALIASES[key] ?? key;
}

/** Canonical ids for a developer's skills, including what they imply. */
export function expandSkills(raw: string[]): Set<string> {
  const out = new Set<string>();
  for (const s of raw) {
    const id = canonicalSkill(s);
    if (!id) continue;
    out.add(id);
    for (const implied of IMPLIES[id] ?? []) out.add(implied);
  }
  return out;
}
