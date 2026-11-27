import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "public/samples/**",
    "public/pdf.worker.min.mjs",
    "chromelock/**",
    "_new_js.js",
    "test-doc*.cjs",
  ]),
]);
