import { createRequire } from "node:module";

const rootRequire = createRequire(import.meta.url);
const nextRequire = createRequire(rootRequire.resolve("eslint-config-next/package.json"));

const nextPlugin = nextRequire("@next/eslint-plugin-next");
const tsParser = nextRequire("@typescript-eslint/parser");
const tsPlugin = nextRequire("@typescript-eslint/eslint-plugin");
const reactHooksPlugin = nextRequire("eslint-plugin-react-hooks");

export default [
  {
    ignores: [
      ".next/**",
      ".test-dist/**",
      ".pnpm-store/**",
      ".codex/**",
      "dist/**",
      "dist-worker/**",
      "node_modules/**",
      "test-results/**",
      "storage/**",
      "public/generated/**",
      "public/uploads/**",
      "prisma/*.db",
      "prisma/*.db-*"
    ]
  },
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    settings: {
      next: {
        rootDir: "."
      },
      react: {
        version: "detect"
      }
    },
    rules: {
      "no-undef": "off"
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true
        }
      ],
      ...reactHooksPlugin.configs.recommended.rules
    }
  },
  nextPlugin.flatConfig.coreWebVitals
];
