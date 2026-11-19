import { describe, expect, it } from "vitest";
import { detectFrameworks } from "@/lib/frameworkDetect";

describe("detectFrameworks", () => {
  it("reads npm dependencies, devDependencies and scoped prefixes", () => {
    const packageJson = JSON.stringify({
      dependencies: { next: "15", react: "19", "@prisma/client": "6", zod: "4" },
      devDependencies: { tailwindcss: "4", "@storybook/react": "8" },
    });
    expect(detectFrameworks({ packageJson })).toEqual([
      "Next.js",
      "React",
      "Prisma",
      "Tailwind CSS",
      "Storybook",
    ]);
  });

  it("recognises a VS Code extension", () => {
    const packageJson = JSON.stringify({ engines: { vscode: "^1.90.0" }, devDependencies: {} });
    expect(detectFrameworks({ packageJson })).toEqual(["VS Code Extension API"]);
  });

  it("reads requirements.txt, ignoring comments, options, extras and pins", () => {
    const requirementsTxt = [
      "# web",
      "Django>=5.0",
      "djangorestframework==3.15",
      "celery[redis]~=5.4",
      "-r base.txt",
      "psycopg2_binary",
    ].join("\n");
    expect(detectFrameworks({ requirementsTxt })).toEqual([
      "Django",
      "Django REST Framework",
      "Celery",
      "PostgreSQL",
    ]);
  });

  it("reads pyproject dependency lists and Poetry tables", () => {
    const pyproject = `
[project]
dependencies = ["fastapi>=0.110", "pydantic"]
[tool.poetry.dependencies]
langchain = "^0.2"
`;
    expect(detectFrameworks({ pyproject })).toEqual(["FastAPI", "Pydantic", "LangChain"]);
  });

  it("reads composer require keys, including vendor prefixes", () => {
    const composerJson = JSON.stringify({
      require: { "magento/framework": "*", "magento/module-catalog": "*" },
      "require-dev": { "phpunit/phpunit": "^10" },
    });
    expect(detectFrameworks({ composerJson })).toEqual(["Magento", "PHPUnit"]);
  });

  it("reads go.mod and Gemfile", () => {
    const goMod = "module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n)\n";
    const gemfile = "source 'https://rubygems.org'\ngem 'rails', '~> 7.1'\n";
    expect(detectFrameworks({ goMod, gemfile })).toEqual(["Gin", "Ruby on Rails"]);
  });

  it("survives malformed or missing manifests", () => {
    expect(detectFrameworks({ packageJson: "{not json", composerJson: "[]" })).toEqual([]);
    expect(detectFrameworks({})).toEqual([]);
  });
});
