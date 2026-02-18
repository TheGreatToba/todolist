import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier/flat";
import globals from "globals";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ["dist/**", "node_modules/**", "**/node_modules/**", ".git/**"],
  },
  {
    files: ["scripts/**/*.mjs", "scripts/**/*.cjs"],
    languageOptions: { globals: globals.node },
  },
];
