import { describe, expect, it } from "vitest";
import { canonicalSkill, expandSkills } from "@/lib/skills";

describe("canonicalSkill", () => {
  it.each([
    ["Next.js", "nextjs"],
    ["NextJS", "nextjs"],
    ["next", "nextjs"],
    ["Next.js App Router", "nextjs"],
    ["Next.js 14", "nextjs"],
    ["Django REST Framework", "drf"],
    ["DRF", "drf"],
    ["Magento 2", "magento"],
    ["Adobe Commerce", "magento"],
    ["Tailwind", "tailwindcss"],
    ["Tailwind CSS", "tailwindcss"],
    ["React (hooks)", "react"],
    ["React.js", "react"],
    ["Postgres", "postgresql"],
    ["Node.js", "nodejs"],
    ["KnockoutJS", "knockout"],
  ])("%s → %s", (raw, id) => {
    expect(canonicalSkill(raw)).toBe(id);
  });

  it("falls back to a compact form for unknown names, so spelling variants still meet", () => {
    expect(canonicalSkill("Some Lib")).toBe(canonicalSkill("some-lib"));
  });

  it("is deterministic", () => {
    expect(canonicalSkill("Next.js App Router")).toBe(canonicalSkill("Next.js App Router"));
  });
});

describe("expandSkills", () => {
  it("adds implied skills", () => {
    expect([...expandSkills(["Next.js", "Django REST Framework"])].sort()).toEqual(
      ["django", "drf", "nextjs", "react"].sort()
    );
  });

  it("ignores blanks", () => {
    expect(expandSkills(["", "  "]).size).toBe(0);
  });
});
