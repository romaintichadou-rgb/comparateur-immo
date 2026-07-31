import type { ReactNode } from "react";

/**
 * Mise en gras des justifications d'estimation (loyer, charges, taxe foncière,
 * assurance) — SOURCE UNIQUE.
 *
 * Deux copies coexistaient (`ApartmentDetail.renderBoldInline` et
 * `LoyerDetailPanel.renderBold`) et avaient DIVERGÉ : la seconde n'avait pas
 * reçu les mots-clés ajoutés plus tard (« taux communal », « syndic »,
 * « copropriété », « chauffage »…). Or les deux rendaient LE MÊME texte
 * (`apt.loyer_justification`), à un clic d'écart — le panneau de détail
 * s'ouvre depuis le champ loyer de la fiche.
 *
 * Ce qui est mis en gras :
 * - `↑…` en emerald et `↓…` en amber (variations, tonalité sémantique) ;
 * - les montants en €, les pourcentages ;
 * - les mots-clés qui portent la justification (ascenseur, travaux, taux
 *   communal…). Ajouter un mot-clé ICI, jamais dans une copie locale.
 */
const MOTS_CLES_JUSTIFICATION =
  /(↑[^↓.]*|↓[^↑.]*|\d[\d\s]*€[^\s]*|\d+,?\d*\s*€|\d+[\s,.]?\d*\s*%|fourchette\s+haute|fourchette\s+basse|au-dessus|en-dessous|valorisation|luminosité|balcon|terrasse|rénov\w*|travaux|parking|cave|ascenseur|calme|vue|taux\s+communal|syndic|entretien|copropriété|exploitation|chauffage|ancien\w*)/gi;

export function renderBoldInline(text: string): ReactNode {
  return text.split(MOTS_CLES_JUSTIFICATION).map((seg, i) => {
    if (i % 2 === 0) return seg;
    if (seg.startsWith("↑")) {
      return (
        <span key={i} className="font-semibold text-emerald-700">
          {seg}
        </span>
      );
    }
    if (seg.startsWith("↓")) {
      return (
        <span key={i} className="font-semibold text-amber-700">
          {seg}
        </span>
      );
    }
    return (
      <strong key={i} className="font-semibold text-ink-900">
        {seg}
      </strong>
    );
  });
}

/**
 * Gras markdown `**…**` — pour les textes RÉDIGÉS PAR LE LLM (synthèse,
 * narration de bloc), où c'est le modèle qui décide de ce qu'il souligne.
 *
 * À ne pas confondre avec `renderBoldInline` ci-dessus, qui déduit le gras
 * d'une regex. Les deux s'appelaient `renderBold` dans deux fichiers
 * différents, avec des comportements distincts — d'où ce nommage explicite.
 */
export function renderMarkdownBold(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-ink-900">
        {seg}
      </strong>
    ) : (
      seg
    )
  );
}
