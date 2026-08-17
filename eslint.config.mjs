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
    // Artefact MINIFIÉ du bookmarklet (une seule ligne), conservé à la racine
    // pour les essais manuels. La source est `src/lib/bookmarklet.ts` — c'est
    // elle qui est lintée. Linter la sortie minifiée ne produisait que du
    // bruit (16 avertissements sur des `catch(e)` compressés) qui masquait les
    // vrais avertissements du dossier `src/`.
    "test-bookmarklet.js",
  ]),
]);

export default eslintConfig;
