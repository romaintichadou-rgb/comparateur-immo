import { formatNombre } from "@/lib/format";
import type { Apartment, PrecisionLocalisation } from "@/lib/types";
import type { DvfData } from "../sources/dvf";
import type { Commodites } from "../sources/osm";
import type { DelinquanceData } from "../sources/delinquance";
import { inviteAdresse, precisionAuMoins } from "../perimetre";
import { clampNote, interpole } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Potentiel" (quartier, liquidité, plus-value) — données réelles :
 *  - DVF : dynamique des prix du quartier (~10 ans) + liquidité (volume réel de
 *    ventes d'appartements dans le secteur, proxy de facilité de revente).
 *  - SSMSI : sécurité du secteur, comparée à la moyenne de la ville pour
 *    Paris/Lyon/Marseille (comparaison intra-ville).
 *  - OpenStreetMap : commodités (attractivité durable du quartier).
 *
 * Note /10 = moyenne des sous-notes réellement disponibles (dynamique,
 * liquidité, sécurité), doublée pour être exprimée sur 10. Chaque sous-note
 * est déterministe.
 */

const SRC_DVF: Source = { label: "DVF (DGFiP)", url: "https://app.dvf.etalab.gouv.fr/" };
const SRC_SSMSI: Source = {
  label: "SSMSI — délinquance",
  url: "https://www.data.gouv.fr/fr/datasets/621df2954fa5a3b5a023e23c/",
};
const SRC_OSM: Source = { label: "OpenStreetMap", url: "https://www.openstreetmap.org/" };

// Indicateurs SSMSI mis en avant (les plus parlants pour un résident).
const INDIC_CLES = [
  "Vols sans violence contre des personnes",
  "Cambriolages de logement",
  "Violences physiques hors cadre familial",
];

export function buildBlocPotentiel(
  apt: Apartment,
  dvf: DvfData | null,
  commodites: Commodites | null,
  delinq: DelinquanceData | null,
  delinqVille: DelinquanceData | null,
  precision: PrecisionLocalisation | null = null
): BlocAnalyse {
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];
  // Sous-notes pondérées : évolution et liquidité (facteurs financiers)
  // pèsent davantage que commodités et sécurité (facteurs de confort).
  let scoreSum = 0;
  let weightSum = 0;
  // Les commodités (OSM) exigent un point proche du bien ; la liquidité, non
  // (voir plus bas). Un seul booléen servait aux deux et coupait les deux.
  const coordsFines = precisionAuMoins(precision, "rue");

  // Formulation commune aux trois blocs concernés — voir `inviteAdresse`.
  const invite = inviteAdresse(apt, precision, {
    requiert: "rue",
    gain: "mesurer les commodités autour du bien",
  });

  // --- Évolution des prix du quartier (DVF) ---
  if (dvf?.evolutionPct != null) {
    if (!sources.includes(SRC_DVF)) sources.push(SRC_DVF);
    const e = dvf.evolutionPct;
    // Ancrages repris À L'IDENTIQUE de l'ancien escalier : on ne change pas la
    // sévérité, on supprime seulement les marches. Entre 0 % et +14 %, la note
    // ne bougeait PAS, puis sautait de 0,8 point à +15 %.
    const evoNote = interpole(e, [
      [-20, 1], // secteur qui décroche
      [-10, 2],
      [0, 3], //   marché stable
      [15, 4],
      [30, 5], //  forte dynamique
    ]);
    scoreSum += evoNote * 0.35; weightSum += 0.35;
    faits.push({
      label: "Évolution des prix",
      value: `${e > 0 ? "+" : ""}${e}`,
      unit: "%",
      detail: `${dvf.ancienMin}–${dvf.ancienMax} → aujourd'hui`,
      // Périmètre lu sur la donnée DVF plutôt que redéduit de `precision` :
      // même fait, même libellé que dans le bloc Prix, qui est affiché sur le
      // même écran.
      perimetre: dvf.perimetreLabel,
      source: SRC_DVF.label,
      gravite: e >= 15 ? "positif" : e >= 0 ? "info" : "attention",
    });
  }

  // --- Liquidité : volume réel de ventes d'appartements du secteur ---
  //
  // ⚠️ **Aucune garde de précision ici.** Un volume de ventes se lit tout aussi
  // bien à l'échelle communale — c'est même sa maille naturelle. La garde
  // `adresseExacte` qui existait supprimait ce critère (poids 0,30) dès qu'il
  // manquait un numéro de voie, alors que la donnée était disponible : la note
  // du bloc se renormalisait en silence sur les seuls critères restants.
  // Seuils inchangés : la comparaison porte sur un ordre de grandeur, pas sur
  // une frontière fine.
  if (dvf && dvf.nbVentesTotal > 0) {
    if (!sources.includes(SRC_DVF)) sources.push(SRC_DVF);
    const v = dvf.nbVentesTotal;
    // Ancrages d'origine, espacés de façon quasi logarithmique : c'est le bon
    // profil pour un COMPTAGE (passer de 15 à 40 ventes change beaucoup plus
    // la liquidité que passer de 150 à 175).
    const liqNote = interpole(v, [
      [0, 1], //    marché atone
      [15, 2],
      [40, 3],
      [80, 4],
      [150, 5], //  marché très liquide
    ]);
    scoreSum += liqNote * 0.30; weightSum += 0.30;
    faits.push({
      label: "Liquidité du marché (revente)",
      value: v,
      unit: "ventes",
      // `volumeLabel`, PAS `recentLabel` : la liquidité compte les ventes de
      // toute la fenêtre collectée, quand la médiane peut n'en retenir qu'une
      // partie (fenêtre adaptative). Deux populations, deux libellés.
      detail: ["appartements", dvf.volumeLabel].filter(Boolean).join(" · "),
      // Comme l'évolution des prix plus haut : libellé lu sur la donnée, jamais
      // codé en dur — il annonçait « rayon 500 m » quel que soit l'endpoint
      // réellement interrogé.
      perimetre: dvf.perimetreLabel,
      source: SRC_DVF.label,
      gravite: v >= 80 ? "positif" : v >= 40 ? "info" : "attention",
    });
  }

  // --- Sécurité (SSMSI), comparée à la ville pour Paris/Lyon/Marseille ---
  if (delinq) {
    sources.push(SRC_SSMSI);
    const cles = delinq.indicateurs
      .filter((i) => INDIC_CLES.some((c) => i.label.startsWith(c.slice(0, 20))))
      .map((i) => `${i.label.replace(/ contre des personnes$/, "")} ${formatNombre(i.taux)}‰`);

    if (delinqVille && delinqVille.tauxAtteintesBiens > 0) {
      const ratio = delinq.tauxAtteintesBiens / delinqVille.tauxAtteintesBiens;
      const ecartPct = Math.round((ratio - 1) * 100);
      // ⚠️ Critère INVERSÉ : un ratio bas est bon. Les ancrages décroissent
      // donc en note quand le ratio monte — `interpole` exige seulement un `x`
      // croissant, pas un `y`.
      const secNote = interpole(ratio, [
        [0.8, 5], // nettement moins exposé que la ville
        [1.1, 4],
        [1.5, 3],
        [2.5, 2],
        [3.5, 1], // très au-dessus de la moyenne de la ville
      ]);
      scoreSum += secNote * 0.15; weightSum += 0.15;
      faits.push({
        label: "Sécurité — atteintes aux biens",
        value: `${ecartPct > 0 ? "+" : ""}${ecartPct}`,
        unit: "% vs ville",
        detail: `${formatNombre(delinq.tauxAtteintesBiens)}‰ vs ${formatNombre(delinqVille.tauxAtteintesBiens)}‰ (moyenne ville)`,
        perimetre: "arrondissement",
        source: SRC_SSMSI.label,
        gravite: ratio <= 1.1 ? "positif" : ratio <= 1.5 ? "attention" : "alerte",
      });
    } else {
      faits.push({
        label: "Sécurité — atteintes aux biens",
        value: formatNombre(delinq.tauxAtteintesBiens),
        unit: "‰",
        detail: cles.length ? cles.join(" · ") : undefined,
        perimetre: "commune",
        source: SRC_SSMSI.label,
        gravite: "info",
      });
    }
  } else {
    donneesManquantes.push("statistiques de délinquance (SSMSI)");
  }

  // Commodités : mesurées dans un rayon autour du point, donc conditionnées à
  // des coordonnées proches du bien (`coordsFines`). `commodites` est de toute
  // façon nul en dessous de ce niveau — `run.ts` n'interroge plus OSM.
  if (coordsFines) {
    // --- Commodités (OSM) — restituées en NIVEAU qualitatif, pas en chiffre brut.
    if (commodites) {
      sources.push(SRC_OSM);
      const total = commodites.transports + commodites.education + commodites.commerces;
      const niveau = total >= 300 ? "Excellent" : total >= 120 ? "Bon" : total >= 50 ? "Moyen" : "Mauvais";
      // Plancher à 2 conservé : un secteur sans commodité recensée reste
      // habitable, et OSM sous-recense les zones rurales — le plancher amortit
      // ce biais de couverture plutôt que de le prendre pour un fait.
      const comNote = interpole(total, [
        [0, 2],
        [50, 3],
        [120, 4],
        [300, 5],
      ]);
      scoreSum += comNote * 0.20; weightSum += 0.20;
      faits.push({
        label: "Commodités",
        value: niveau,
        detail: `${commodites.transports} transports · ${commodites.education} écoles/facs · ${commodites.commerces} commerces`,
        perimetre: `rayon ${commodites.rayonM} m`,
        source: SRC_OSM.label,
        gravite: total >= 120 ? "positif" : total >= 50 ? "info" : "attention",
      });
    } else {
      donneesManquantes.push("commodités (OpenStreetMap momentanément indisponible)");
    }
  }

  const note = weightSum > 0 ? clampNote((scoreSum / weightSum) * 2) : null;

  const disponible = note != null || faits.length > 0;
  return {
    cle: "potentiel",
    titre: BLOC_LABELS.potentiel,
    note,
    poids: BLOC_POIDS.potentiel,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    invite,
    messageIndisponible: disponible ? undefined : "Données de quartier indisponibles pour ce bien.",
  };
}
