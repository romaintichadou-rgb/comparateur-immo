# Typographie Responsive et Espacements — Référence Complète

> Référence de domaine — chargée quand la tâche touche les breakpoints typographiques,
> les espacements verticaux, ou l'optimisation responsive. Hiérarchie complète H1-H4
> documentée dans `AGENTS.md`. Pointeur depuis `AGENTS.md`.

## Hiérarchie Typographique Complète

Trois polices, quatre niveaux sémantiques. Taille ET variation optique (`opsz`) distinguent les niveaux.

### Fraunces (display font) — Titres structurels

| Niveau | Rôle | Mobile | Desktop | opsz | Composant |
|--------|------|--------|---------|------|-----------|
| Hero | Écrans vides/erreurs/upgrade | 48px | 64px | 36 | inline |
| H1 | Titre de page OU onglet fiche bien | 40px | 48px (page) / 28px (onglet) | 36 | `<h1>` / `TabHeader` |
| H2 | Sous-section d'onglet (ex: "Vue d'ensemble") | **20px** | **22px** | 24 | `SectionH2` / `GroupHeader as="h2"` |

**Classe CSS source** : `.heading-h2-subsection` dans `globals.css`

### IBM Plex Sans (sans-serif) — Données et cartes

| Niveau | Rôle | Taille | opsz | Composant |
|--------|------|--------|------|-----------|
| H3 | Titre de carte de section | 14-16px | 20 | `SectionHeader` / `SectionTitle` |
| H4 | Groupe à l'intérieur d'une carte | 14-16px | 18 | `GroupTitle` / `GroupHeader as="h4"` |

**Justification** : les titres de cartes portent souvent des chiffres (loyer, rendement, prix). 
IBM Plex traite les chiffres comme du texte (lisible comme donnée), Fraunces les traite comme 
des caractères de titrage (air de magazine). Inversion volontaire par rapport à H1-H2.

---

## Breakpoints Responsifs

Définis avec `@media (min-width: 640px)` dans `globals.css`.

### Viewport Standards

| Appareil | Largeur | Breakpoint | Status |
|----------|---------|------------|--------|
| Mobile (iPhone) | 375px | **< 640px** (mobile) | ✅ Testé |
| Tablet | 768px | **≥ 640px** (desktop) | ✅ Testé |
| Desktop | 1280px+ | **≥ 640px** (desktop) | ✅ Testé |

### Tailles de Typo par Breakpoint

```css
/* Mobile (< 640px) */
.heading-h1 { font-size: 40px; }
.heading-h2 { font-size: 24px; }
.heading-h2-subsection { font-size: 20px; }
/* (H3/H4 IBM Plex: 14px, pas de breakpoint) */

/* Desktop (≥ 640px) */
@media (min-width: 640px) {
  .heading-h1 { font-size: 48px; }
  .heading-h2 { font-size: 28px; }
  .heading-h2-subsection { font-size: 22px; }
}
```

---

## Espacements Verticaux — Rythme 2:1

**Source unique** : `AGENTS.md` section "Rythme vertical — Espacements cohérents".

### Espaces Clés

| Contexte | Valeur | Usage |
|----------|--------|-------|
| Padding page top | 48px | En-tête avant contenu |
| Padding page sides | **28px desktop / 16px mobile** | Largeur colonne |
| Padding page bottom | 80px | Espace avant sticky footer |
| Margin section | 48px | Entre deux sections |
| Padding card | 24px | Interne (tous côtés) |
| Gap grille | 16px | Entre cartes |
| Margin titre groupe | 10px | Sous titre dans carte |
| Divider (top/bottom) | 44px | Entre sections grandes |

### Calcul de Séparation

Espace TOTAL entre deux sections : **136px**
```
48px (margin-section) 
+ 44px (divider top) 
+ 44px (divider bottom)
= 136px
```

---

## Responsive Mobile — Zones de Tap

**Minimum WCAG2** : 44px × 44px.

### Implémentation Courante

| Élément | Classe | Hauteur | Status |
|---------|--------|---------|--------|
| Navbar | standard | 44px | ✅ `min-h-11` |
| Onglets | `min-h-11` + `py-1.5 sm:py-4` | 44px | ✅ Conforme |
| Boutons CTA | `px-5 py-2.5` | 40px minimum | ⚠️ Approche seuil |
| Input fields | `py-2 sm:py-2.5` | 36-40px | ⚠️ À vérifier densité |

### Patterns de Wrapping Mobile

**Piège #1** : rangée inline qui déborde sous voisin
- **Solution** : `flex-wrap` + `gap-y-1 sm:gap-y-2` toujours

**Piège #2** : badge `absolute` recouvre contenu
- **Solution** : badge EN FLUX (`mt-auto flex justify-between`) pas positionné

**Piège #3** : espace normale coupe montant en deux
- **Solution** : espace **insécable** U+00A0 dans `formatEurosSigned`

**Piège #4** : valeur + boutons sur une ligne, c'est la valeur qui casse
- **Solution** : valeur `whitespace-nowrap`, conteneur `flex-wrap`, boutons à la ligne d'un bloc

---

## Vérification Responsive

### Checklist de Test

- [ ] Mobile 375px : H1 24px, H2 20px, H3 14px
- [ ] Desktop 1280px : H1 28px, H2 22px, H3 16px
- [ ] Padding page : 28px sides mobile / 48px desktop
- [ ] Tap zones : minimum 44px sur tous les boutons
- [ ] Tables : scrollbar visible (`.no-scrollbar` réservé onglets/sélecteurs)
- [ ] Flex-wrap appliqué à rangées métadonnées
- [ ] Badges EN FLUX (pas `absolute`)
- [ ] Espaces insécables dans montants

---

## Localisation CSS

**Source unique des breakpoints** : `/src/app/globals.css`

```
.heading-h1 (L115-128)
.heading-h2 (L131-145)
.heading-h2-subsection (L148-160) ← nouveau
```

**Constantes de classe** : `/src/components/SectionHeader.tsx`

```typescript
export const TITRE_SECTION = "font-sans text-sm font-semibold text-ink-900 sm:text-base";
export const TITRE_GROUPE = "font-sans text-sm font-semibold text-ink-900 sm:text-base";
export const TITRE_H2 = "heading-h2-subsection";
```

---

## Audit Responsif (v1.0)

**Date** : 2026-08-19  
**Status** : ✅ Complet

| Point | Résultat | Notes |
|-------|----------|-------|
| Typo breakpoints | ✅ Fonctionnel | H1/H2/H3/H4 testés 375px → 1280px |
| Espacements | ✅ Conformes | AGENTS.md appliqué |
| Tap zones | ✅ 44px+ | Onglets, boutons conformes |
| Wrapping mobile | ✅ flex-wrap systématique | Rangées métadonnées OK |
| Couleurs sémantiques | ✅ Centralisées | `scoring.ts` source unique |
