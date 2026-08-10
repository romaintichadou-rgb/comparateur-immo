import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Le préfixe `_` marque une liaison VOLONTAIREMENT inutilisée : c'est
      // l'idiome pour retirer une clé d'un objet (`const { user_id: _ignore,
      // ...reste } = patch`), où la variable n'existe que pour être écartée.
      // Sans cette exception, le seul moyen de faire taire l'avertissement
      // serait un commentaire eslint-disable à chaque occurrence — du bruit
      // qui finit par masquer les vrais oublis.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
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
