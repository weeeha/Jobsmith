import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/db/client", "**/lib/db/client", "**/db/client"],
              message:
                "app/ and components/ must not import the database client directly. Use the scoped helper from @/lib/db/scoped.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Local-only folders, never committed: Claude Code keeps worktrees (each
    // with its own .next build) under .claude/, and planning spikes live
    // under .superpowers/. Linting them fails the main checkout's lint.
    ".claude/**",
    ".superpowers/**",
  ]),
]);

export default eslintConfig;
