// Next 16 removed the `next lint` command, and ESLint 9+ reads flat config
// only. `eslint-config-next/*` each export a flat `Linter.Config[]`.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"] },
  ...nextCoreWebVitals,
  ...nextTypeScript,
];

export default config;
