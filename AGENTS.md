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
  - `signal-50/100/300/500/600/700` : argile, **définie mais non utilisée
    actuellement dans l'UI**. Ne pas l'assigner aux actions destructives ni
    à autre chose sans validation explicite — ce n'est pas une gamme "prête
    à l'emploi" malgré sa présence dans le thème.
  - Destructif (supprimer, etc.) : `red-*` Tailwind standard (`bg-red-600`
    / hover `red-700` pour un bouton plein, `text-red-600` pour une action
    inline). C'est une dérogation volontaire et assumée à la règle
    "pas de Tailwind par défaut" ci-dessus : le rouge se lit universellement
    comme danger et recoupe la couleur déjà utilisée pour les alertes de
    score (voir plus bas), donc `signal-*` ne doit **pas** remplacer ce
    rouge — ne pas "corriger" ce point en relisant la charte au premier
    degré.
  - Les couleurs sémantiques (`emerald-*`/`amber-*`/`red-*` pour la qualité
    d'un score ou d'un statut) restent séparées de l'accent de marque — ne
    pas les migrer vers `accent-*`.
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
  souligné, sans fond), Destructif (`red-*`, voir "Couleurs" ci-dessus),
  Désactivé (opacité réduite). **Aucune icône à l'intérieur d'un CTA** —
  texte seul. Exception : les affordances icône-seule compactes (ex. bouton
  "supprimer" en corbeille sur une ligne de tableau/carte) ne sont pas des
  CTA au sens de cette règle — voir `ApartmentsTable.tsx` /
  `ApartmentsCardList.tsx`.
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
  dans `AddApartmentFlow.tsx` pour l'exemple de référence. Autre motif de
  fond disponible : `.bg-tech-grid` (`globals.css`) — grille fine masquée en
  radial, réservée aux écrans vides/hero, jamais sur une zone de lecture
  dense. Comme elle s'applique en `background-image` sur tout l'élément (et
  donc ses enfants), la poser sur un calque `absolute` isolé plutôt que sur
  le conteneur du contenu (voir `EmptyHomeState.tsx`).
- **Cartes** (blocs `border border-ink-200 bg-white rounded-xl/lg`) : pas de
  `shadow-sm` — le bordé seul suffit à détacher le bloc du fond `ink-50`.
  L'ombre reste réservée aux éléments réellement flottants au-dessus du
  contenu (modales, tooltips, badges superposés à la carte Leaflet) où elle
  signale une élévation, pas une décoration de carte.
- **Confirmation destructive** : passer par `ConfirmDialog.tsx` (modale
  générique : titre, description, bouton destructif `red-*`, focus initial
  sur "Annuler" pour qu'un geste délibéré soit nécessaire) plutôt que
  `window.confirm()`. Pour un flux de suppression, réutiliser
  `useDeleteApartment.tsx` (mutualisé entre `ApartmentsTable`,
  `ApartmentsCardList`, `ApartmentDetail`) plutôt que ré-écrire l'appel
  DELETE et la gestion d'état à chaque écran.
- **Navbar** (`Navbar.tsx`) : sticky (`sticky top-0 z-40`) avec un liseré
  dégradé `accent-600 → accent-400 → accent-600` de 3px en tout haut. Lien
  actif signalé par une couleur (`text-accent-700`) + un soulignement
  (`bg-accent-600`), jamais par un fond plein. Le hover des liens inactifs
  reprend la couleur de l'état actif en plus léger (`hover:bg-accent-50
  hover:text-accent-700`) plutôt qu'un gris neutre — le survol doit annoncer
  ce que devient le lien une fois actif.

# Modélisation "Immeuble" (bien de rapport multi-lots)

Tout le modèle (`Apartment`, estimations, calculs, Analyse IA) suppose par
défaut **un seul logement**. Le type de bien `"Immeuble"` (voir `TYPES_BIEN`
dans `src/lib/types.ts`) est la seule exception, et casse plusieurs de ces
hypothèses. Ne jamais tester `apt.type_bien === "Immeuble"` directement :
utiliser le prédicat centralisé **`isImmeuble(typeBien)`** (`src/lib/types.ts`,
insensible à la casse/espaces) — c'est le seul endroit qui doit connaître la
valeur exacte de la chaîne.

- **Migration requise** : `supabase/migrations/0003_nb_lots.sql` ajoute la
  colonne `nb_lots`. Comme les autres migrations, à exécuter manuellement sur
  CHAQUE projet Supabase (prod et dev) — sans elle, toute création de bien
  échoue (le payload d'insertion inclut `nb_lots`).
- **`nb_lots`** (`Apartment.nb_lots`, nullable) : nombre de logements de
  l'immeuble. N'a de sens que pour un Immeuble ; `null` pour un logement
  unique. Champ affiché conditionnellement dans `AddApartmentFlow.tsx` et
  `ApartmentDetail.tsx` (`{isImmeuble(...) && <NumberField .../>}`), jamais
  affiché pour les autres types.
  Quand `nb_lots` n'est pas renseigné, utiliser **`lotsEffectifs(nb_lots,
  surface_m2)`** (`src/lib/estimates.ts`) plutôt que de deviner ailleurs — ordre
  de grandeur ~1 logement / 55 m², plancher 2.
- **Loyer (`loyer_retenu`)** : pour un Immeuble, c'est le loyer mensuel
  **TOTAL de tous les lots**, jamais le loyer d'un logement unique. L'ancrage
  vient de la décision produit explicite (pas d'un champ séparé par lot) :
  un seul champ, mais dont la sémantique change selon le type. L'estimation IA
  (`estimateRent` dans `src/lib/rentEstimation.ts`) utilise un prompt dédié
  (`buildImmeublePrompt`) qui demande explicitement un raisonnement lot par
  lot puis une somme — ne JAMAIS repasser sur le prompt "logement unique"
  pour ce cas, le total serait alors sous-estimé d'un facteur `nb_lots`.
- **Charges annuelles** : un immeuble entier n'a pas de copropriété (on
  possède tout le bâtiment) — `estimateChargesCopro(surfaceM2, immeuble)`
  utilise un barème et un libellé différents ("Charges d'exploitation
  annuelles" au lieu de "Charges copro annuelles", ~12 €/m²/an au lieu de
  ~20 €/m²/an, plancher 1500 € au lieu de 800 €). Le libellé UI doit suivre
  `isImmeuble()`, pas rester générique.
- **Assurance** (`estimateAssurance(immeuble, nbLots, surfaceM2)`) : un
  immeuble assure chacun de ses lots — le montant par défaut par logement
  (150 €/an) est multiplié par `lotsEffectifs(...)`, jamais un montant fixe
  unique comme pour un logement seul.
- **Analyse IA — bloc Prix** (`src/lib/analyse/blocs/prix.ts`) : la seule
  source de comparaison (DVF) ne contient que des ventes d'**appartements au
  détail** (`codtypbien=121`). Décision produit assumée : garder la
  comparaison plutôt que la neutraliser, mais avec un avertissement explicite
  ("vente en bloc, décote 10-20 %") et une note qui intègre une décote
  attendue de 12 % avant calcul, plafonnée à 8/10 (`NOTE_MAX_IMMEUBLE`) — un
  immeuble ne doit jamais recevoir la note max sur ce bloc, la comparaison
  reste structurellement incertaine. Ne pas retirer cet avertissement ni
  déplafonner la note en pensant "simplifier".
- **Analyse IA — bloc Location** (`src/lib/analyse/blocs/location.ts`) : le
  loyer/m² d'un immeuble est une MOYENNE sur tous les lots, légitimement plus
  élevée que le loyer/m² médian d'un logement unique (les petits logements se
  louent plus cher au m²). Les seuils de détection "loyer optimiste" sont
  donc volontairement plus permissifs pour un immeuble (`seuilMax` ×1.25,
  `seuilEcart` 30 % au lieu de 10 %) — ne pas aligner ces seuils sur ceux
  d'un logement unique, ça déclencherait un faux positif systématique.
- **Narration** (`src/lib/analyse/run.ts` → `contexteBien`,
  `src/lib/analyse/narration.ts`) : un paragraphe de contexte est injecté
  dans le prompt de narration quand `isImmeuble()`, pour que le LLM parle de
  "cet immeuble" (jamais "cet appartement") et comprenne que le loyer cité
  est un total. Si un nouveau bloc d'analyse est ajouté, vérifier s'il a
  besoin du même traitement (comparer à une base "appartement" par défaut).
- **Limite connue, non traitée** : la simulation financière
  (`src/lib/simulation.ts`) suppose partout le régime **LMNP réel (meublé)**.
  Un immeuble de rapport est souvent loué nu (revenus fonciers, régime
  fiscal différent) — les montants restent corrects (ils scalent avec le
  loyer total et les charges totales), mais le régime fiscal n'est PAS
  spécialisé par type de bien. À traiter comme un chantier séparé si demandé,
  pas un oubli à corriger silencieusement en marge d'une autre tâche.
