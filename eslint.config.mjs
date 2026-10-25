import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The fuzz reference must stay independent of the code it checks.
    files: ["fuzz/reference/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/*", "**/src/**", "../../src/**"], message: "fuzz/reference must not import app code." }] },
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
  ]),
]);

export default eslintConfig;
