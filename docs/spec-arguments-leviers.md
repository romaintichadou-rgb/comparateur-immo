# Spec — Arguments par levier (onglet « Optimiser »)

## 1. Contexte & objectif

L'onglet **Optimiser** (`OptimiserView.tsx`) propose, pour chaque levier (prix,
travaux, loyer, financement), une action chiffrée + son impact rentabilité.
Il manque le **« comment »** : une liste d'**arguments concrets** pour passer à
l'action.

- **Prix** : sur quoi m'appuyer pour justifier une baisse ? Quels verbatim pour
  convaincre le vendeur ?
- **Loyer** : que faire concrètement pour louer plus cher ?
- **Travaux / Financement** : par où commencer, quels leviers réels.

Objectif : donner à l'investisseur des **arguments réels et actionnables**, dont
des **verbatim prêts à l'emploi**, adossés aux données déjà collectées.

Contrainte forte du produit : la feature doit rester **discrète** (elle ne doit
pas alourdir la carte ni détourner du chiffre-clé).

## 2. Principe directeur (non négociable)

Comme le reste de l'app : **aucune donnée inventée**. Un argument s'appuie soit
sur un **fait réel déjà présent dans l'analyse** (écart DVF, DPE ADEME, N ventes
comparables, fourchette ANIL, coût travaux estimé, cash-flow simulé…), soit sur
une **bonne pratique générique** (méthode de négociation, délégation d'assurance,
meublé qualité…) qui ne contient aucun chiffre inventé.

Le « verbatim » est une **mise en mots** (comme la narration), jamais une source
de chiffre : les nombres qu'il contient proviennent des faits.

## 3. Emplacement UI & discrétion

Sous chaque carte de levier, **un déclencheur discret** (texte + chevron,
`text-ink-400`/`accent-500`, pas de bouton plein), masqué par défaut :

| Levier | Libellé du déclencheur |
|---|---|
| prix | « Arguments pour négocier » |
| travaux | « Par où commencer » |
| loyer | « Comment louer plus cher » |
| financement | « Optimiser le financement » |

**Comportement retenu : accordéon inline** (repliable, fermé par défaut) DANS la
carte — pas de popup. Motifs : (a) contextuel (reste collé au levier), (b) plus
discret qu'un panneau latéral, (c) zéro nouvel écran à maintenir.
_Alternative écartée mais possible : réutiliser un panneau latéral façon
`RendementDetailPanel` — plus lourd, moins discret._

Contenu déplié : liste compacte d'arguments. Chaque argument =
- **titre** en gras (court),
- **detail** (1 phrase, chiffres du bien interpolés),
- **verbatim** optionnel, en bloc cité (« … ») avec, à terme, un bouton *copier*,
- **source** optionnelle en micro-label (DVF, ADEME, ANIL) pour la crédibilité.

Le déclencheur n'apparaît que si le levier a **≥ 1 argument**.

## 4. Modèle de données

Nouveau type, rattaché à la reco existante (chaque levier porte ses arguments) :

```ts
// types.ts
export interface Argument {
  /** Titre court (ex. "Prix au-dessus du marché"). */
  titre: string;
  /** Explication en 1 phrase, chiffres du bien interpolés. */
  detail: string;
  /** Phrase prête à dire/écrire au vendeur/locataire (affichée entre « »). */
  verbatim?: string;
  /** Source du fait qui fonde l'argument (crédibilité). */
  source?: "DVF" | "ADEME" | "ANIL" | "Géorisques" | "Calcul";
}

export interface Recommandation {
  // …champs existants…
  /** Arguments concrets pour passer à l'action (lecture seule, déterministe). */
  arguments?: Argument[];
}
```

**Versioning** : bump `ANALYSE_VERSION` (→ 3). Les analyses antérieures ont
`arguments == undefined` → le déclencheur n'apparaît pas (dégradation
silencieuse, comme le champ `recommandations` avant). Pas d'invite dédiée.

## 5. Génération (déterministe, dans le moteur)

Les arguments sont construits **dans `buildRecommandations`** (recommandations.ts),
au même endroit que les recos, où toutes les données externes (DVF, ANIL, DPE,
géorisques, cash-flow simulé, écart marché) sont en portée. **Zéro appel
réseau/LLM**, régénéré à chaque analyse.

Deux familles, toutes deux déterministes :
- **Arguments contextuels** : conditionnés par les données du bien (n'apparaissent
  que si le fait existe), avec les chiffres réels interpolés.
- **Arguments de méthode** : playbook statique, toujours pertinents pour le levier.

Helper par levier : `buildArgumentsPrix(apt, ctx)`, `…Loyer`, `…Travaux`,
`…Financement`, renvoyant `Argument[]` (contextuels d'abord, méthode ensuite).

> **Décidé** : génération **100 % déterministe** (aucun appel LLM). Verbatim =
> templates avec chiffres réels interpolés. (Enrichissement LLM = option v2, hors
> périmètre.)

## 6. Contenu par levier

Notation : _[contextuel]_ = affiché seulement si la donnée le supporte, avec
chiffres réels ; _[méthode]_ = statique. Le **verbatim s'adresse au vendeur/
locataire (vouvoiement)** ; le detail s'adresse à l'investisseur (tutoiement,
cohérent avec l'app).

### 6.1 PRIX — justifier une baisse

- _[contextuel — si écart DVF > 0]_ **Prix au-dessus du marché** — « Le prix
  ressort +X % vs la médiane des ventes réelles du quartier (N ventes à Y €/m²
  sur 3 ans). » · verbatim : « D'après les ventes notariales récentes du secteur
  (base DVF), le prix au m² tourne autour de **Y €**. Votre bien est **X %**
  au-dessus ; je me positionne à **Z €**, cohérent avec le marché. » · source DVF.
- _[contextuel — comparables]_ **Ventes comparables** — cite 1–2 ventes récentes
  du rayon 500 m (prix/m², surface) comme référence concrète. · source DVF.
- _[contextuel — DPE E/F/G]_ **DPE = décote** — « Classe F : interdiction de louer
  en 2028 + travaux obligatoires. » · verbatim : « Le DPE F impose une rénovation
  avant 2028 pour louer ; son coût (~**X €**) doit être déduit du prix. » · ADEME.
- _[contextuel — cash-flow < 0]_ **Rentabilité à l'équilibre** — « À ce prix, le
  cash-flow est négatif (**−X €/mois**). » · verbatim : « À ce niveau de prix,
  l'opération est déficitaire ; pour qu'elle tienne, il faut viser **~Z €**. »
- _[contextuel — TF/charges élevées]_ **Charges élevées** — TF/copro au-dessus de
  la moyenne locale, argument de dévalorisation.
- _[méthode]_ **Ancre bas, mais argumenté** — fais une offre écrite, chiffrée,
  avec ton plan de financement prêt (crédibilité = poids).
- _[méthode]_ **Renseigne la motivation vendeur** — ancienneté de l'annonce,
  baisses de prix déjà passées, raison de la vente.
- _[méthode]_ **Reste factuel et engageant** — « acheteur sérieux, prêt à signer
  vite » ; n'annonce jamais ton budget max.

### 6.2 TRAVAUX — débloquer + valoriser

- _[contextuel — DPE E/F/G]_ **Sortie de passoire** — « Rénover jusqu'à D lève
  l'interdiction de louer (G 2025 / F 2028 / E 2034) et sécurise la revente. »
- _[contextuel]_ **Loyer premium après réno** — un bien refait se loue jusqu'à
  +**12 %** (base `LOYER_BOOST_RENO`) — voir le levier Loyer.
- _[méthode]_ **Aides mobilisables** — MaPrimeRénov', éco-PTZ, CEE réduisent la
  facture (éligibilité selon situation ; à vérifier).
- _[méthode]_ **LMNP : travaux amortissables** — les travaux gomment l'impôt
  plusieurs années (régime réel).
- _[méthode]_ **Priorise l'impact** — d'abord isolation/chauffage/menuiseries
  (DPE), puis cuisine/SdB (loyer). Chiffre 2–3 devis AVANT d'acheter — ils
  servent aussi d'argument prix.

### 6.3 LOYER — louer plus cher

- _[contextuel — loyer < marché]_ **Marge de revalorisation** — « Ton loyer est
  X % sous le haut de fourchette ANIL du secteur (Y €/m²). »
- _[contextuel — commodités OSM]_ **Mets en avant les atouts** — cite les
  commodités réelles à proximité (gare à N m, commerces, écoles) dans l'annonce.
- _[méthode]_ **Meublé qualité (LMNP)** — mobilier soigné, électroménager,
  literie neuve : le meublé haut de gamme justifie le premium.
- _[méthode]_ **Rafraîchissement à petit budget** — peinture claire, luminaires :
  des photos qui donnent envie = candidats plus nombreux, loyer tenu.
- _[méthode]_ **Annonce pro** — photos lumineuses, description qui vend les
  atouts, réactivité aux demandes.
- _[méthode — caveat]_ **Vérifie l'encadrement des loyers** de la commune : un
  plafond légal peut s'appliquer (Paris, Lille, Lyon, Montpellier…).

### 6.4 FINANCEMENT — améliorer le cash-flow

- _[méthode]_ **Mets les banques en concurrence** — ou passe par un courtier
  (gain sur le taux).
- _[méthode]_ **Délègue l'assurance emprunteur** (loi Lemoine) — souvent le plus
  gros gain sur le coût total du crédit.
- _[méthode]_ **Ajuste durée / apport / différé** selon ton objectif de
  cash-flow.
- _[contextuel]_ **LMNP réel** — les amortissements créent des années sans impôt
  (déjà pris en compte dans la simulation).
- _[note]_ Levier d'appoint : améliore le cash-flow, pas la rentabilité
  intrinsèque du bien.

## 7. Ton & formatage

- **detail** : tutoiement (cohérent avec l'onglet). **verbatim** : vouvoiement
  (l'investisseur s'adresse au vendeur/locataire).
- Verbatim affiché entre guillemets français « … », en italique léger, montants
  en gras (réutiliser `renderBold` si utile).
- Longueur : titre ≤ 40 car, detail = 1 phrase, verbatim ≤ 2 phrases.
- Nombre d'arguments par levier : viser **3–6** (contextuels prioritaires).

## 8. Cas limites

- **Aucune adresse exacte** → pas d'écart DVF ni de comparables : les arguments
  prix « marché » sautent ; restent les arguments méthode + DPE + cash-flow.
- **Bien déjà sous le marché** (prix 10/10) : l'argument « au-dessus du marché »
  ne s'affiche pas ; on garde les arguments méthode.
- **Levier absent** (ex. pas de reco travaux car DPE ≤ D) → pas d'arguments pour
  ce levier (ils vivent dans la reco).
- **`arguments == undefined`** (analyse pré-v3) → déclencheur masqué.

## 9. Décisions (tranchées)

1. **Génération : déterministe** (aucun LLM). ✔
2. **UI : accordéon inline** (repliable, fermé par défaut, pas de popup). ✔
3. **Bouton « copier » le verbatim : non en v1** (reporté v2). ✔
4. **`ANALYSE_VERSION` → 3** ; anciennes analyses = déclencheur masqué, sans
   invite. ✔

## 10. Découpage d'implémentation (indicatif)

1. `types.ts` : `Argument` + `Recommandation.arguments?` + bump version.
2. `recommandations.ts` : `buildArgumentsPrix/Loyer/Travaux/Financement`, appelés
   dans chaque `buildLevier*`, remplissant `reco.arguments`.
3. `OptimiserView.tsx` : composant `<ArgumentsAccordion reco={…} />` discret sous
   chaque carte (état ouvert/fermé local).
4. Doc `AGENTS.md` (section Optimiser).
5. Vérif : relancer une analyse, dérouler les arguments par levier.
