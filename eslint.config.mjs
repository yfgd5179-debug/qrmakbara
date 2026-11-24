import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party skill/agent directories dropped into the repo root —
    // not part of this app and not linted by it.
    ".agents/**",
    ".claude/**",
    "agent-browser/**",
    "awesome-free-llm-apis/**",
    "caveman/**",
    "claude-mem/**",
    "claude-seo/**",
    "graphify/**",
    "grillme-skill/**",
    "ponytail/**",
    "skills-lock.json",
  ]),
]);

export default eslintConfig;
