<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Charte graphique — identité "Immoscore"

Toute évolution UI doit respecter cette charte. Ne pas réintroduire les
couleurs Tailwind par défaut (`slate-*`, `indigo-*`, `gray-*`) ni d'icônes
dans les boutons CTA.

- **Nom de l'app** : importer `APP_NAME` depuis `src/lib/constants.ts`,
  jamais de chaîne `"Immoscore"` codée en dur dans un nouveau composant.
- **Couleurs** (définies dans `src/app/globals.css`, `@theme inline`) :
  - `ink-50` → `ink-900` : neutre teinté violet (fond, texte, bordures),
    remplace `slate-*`. Fond de page par défaut : `ink-50` (#efecf6,
    "Bruyère").
  - `accent-50` → `accent-900` : violet d'encre, seul accent de marque,
    remplace `indigo-*`. Base `accent-600` (#3d3580).
  - `signal-50/100/300/500/600/700` : argile, réservé aux actions
    destructives (supprimer, etc.) — ne jamais l'utiliser comme couleur
    décorative.
  - Les couleurs sémantiques (`emerald-*`/`amber-*`/`red-*` pour la qualité
    d'un score ou d'un statut) restent séparées de l'accent de marque — ne
    pas les migrer vers `accent-*`/`signal-*`.
- **Typographie** (`next/font/google` dans `src/app/layout.tsx`) :
  - `font-display` (Fraunces) : titres H1/H2, jamais le corps de texte.
  - `font-sans` (IBM Plex Sans) : corps de texte, valeur par défaut.
  - `font-mono` (Geist Mono) : tout chiffre clé — score, prix, rendement,
    cash-flow (voir `ScoreGauge`, `ScoreBadge`, `ApartmentsTable` pour
    l'exemple). Ne pas revenir à IBM Plex Mono.
  - `font-wordmark` (Outfit) : réservé au wordmark « Immoscore » de la
    navbar, nulle part ailleurs.
- **Logo** : `AppMark` exporté depuis `src/components/Navbar.tsx` (motif
  anneau ouvert + point). Réutiliser ce composant plutôt que redessiner une
  variante. Il n'est PAS affiché dans la navbar (wordmark seul) — la navbar
  signe la marque en mettant « score » en `accent-600` (voir `Wordmark`).
- **Boutons** : Primaire (`bg-accent-600` plein, hover `accent-700`),
  Secondaire (contour `ink-300`, hover `bg-ink-50`), Tertiaire (lien
  souligné, sans fond), Destructif (`signal-*`, jamais rouge), Désactivé
  (opacité réduite). **Aucune icône à l'intérieur d'un CTA** — texte seul.
  Taille standard pour tout CTA principal/secondaire de page :
  `rounded-lg px-5 py-2.5 text-sm font-medium` (voir le bouton "Analyser"
  dans `AddApartmentFlow.tsx`). Les actions inline compactes (sauvegarde
  contextuelle dans une bannière, actions de ligne de tableau) peuvent rester
  plus petites (`px-3 py-1.5 text-xs`), de même que le CTA de la navbar
  (contrainte de hauteur du header) — mais tous les CTA de page pleine
  largeur ou en pied de formulaire doivent utiliser la taille standard,
  jamais plus grands.
- **Fonds décoratifs** (hero, bannières) : dégradé subtil en `accent-50` /
  `white`, jamais de bleu/indigo Tailwind par défaut. Pour une touche "tech
  luxe", un filigrane du logo (`AppMark`) en très faible opacité peut
  servir de motif de fond — toujours via la classe `opacity-*` sur le SVG
  entier (pas un modificateur `text-color/opacity`), car le point signal du
  logo a une couleur `fill` fixe qui ignorerait sinon l'opacité et
  ressortirait comme une tache colorée isolée. Voir l'étape "Coller l'URL"
  dans `AddApartmentFlow.tsx` pour l'exemple de référence.
