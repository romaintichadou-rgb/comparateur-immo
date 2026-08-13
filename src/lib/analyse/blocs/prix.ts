import { isImmeuble, type Apartment, type PrecisionLocalisation } from "@/lib/types";
import type { DvfData } from "../sources/dvf";
import { clampNote } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Prix d'achat" — 100 % basé sur des transactions réelles (DVF+ Cerema).
 * On compare le prix/m² d'acquisition du bien (prix affiché / surface, hors
 * travaux, pour rester comparable aux prix de vente DVF) à la médiane réelle
 * du secteur sur les 3 dernières années, et on affiche l'évolution sur ~10 ans.
 *
 * Note /10 (10 = affaire) purement déterministe : elle dépend uniquement de
 * l'écart au prix médian réel du quartier.
 *
 * ⚠️ **Le bloc est noté avec ou sans adresse exacte** — c'est le PÉRIMÈTRE de
 * comparaison qui change, pas la disponibilité de l'analyse. Avec l'adresse :
 * rayon 500 m autour du bien. Sans : commune entière (arrondissement à Paris /
 * Lyon / Marseille), via un autre endpoint DVF (voir `DvfPerimetre`).
 * Ne pas revenir au blocage précédent (invite au lieu d'une note) : l'adresse
 * exacte est absente de la grande majorité des annonces au moment de l'ajout,
 * et le bloc le plus lourd de la note globale (poids 0,3) restait donc vide
 * pour la plupart des biens — `BLOC_POIDS_SANS_PRIX` redistribuait alors le
 * poids sur les autres blocs, et l'écran perdait sa métrique la plus décisive.
 * La moindre finesse de la comparaison est portée par `FIABILITE_QUARTIER`
 * (note rapprochée de la neutralité), pas par l'absence de note.
 *
 * Cas de l'immeuble : la source DVF ne contient que des ventes d'appartements
 * au détail (codtypbien 121). Un immeuble se vend EN BLOC, avec une décote
 * usuelle de ~10-20 % sur le prix/m² au détail. On conserve la comparaison
 * (faute de meilleure donnée) mais on l'affiche assortie d'un avertissement, et
 * la note tient compte de cette décote attendue.
 */

const SRC_DVF: Source = {
  label: "DVF (DGFiP)",
  url: "https://app.dvf.etalab.gouv.fr/",
};

const DECOTE_BLOC_ATTENDUE = 0.12;
const NOTE_MAX_IMMEUBLE = 8;

/**
 * Poids gardé par la note quand la comparaison est au QUARTIER et non au rayon
 * de 500 m ; le complément est ramené vers la neutralité (5).
 *
 * Une médiane de quartier ne dit rien de la rue : à l'intérieur d'un même
 * quartier, l'écart de prix entre deux adresses atteint couramment ±20 %. La
 * comparaison reste informative, mais elle ne justifie pas un 10 ni un 0 — le
 * même traitement que celui déjà appliqué aux petits échantillons
 * (`nbVentesRecent < 15`), et pour la même raison : une incertitude réelle se
 * traduit par une note prudente, jamais par une note absente.
 */
const FIABILITE_QUARTIER = 0.65;

export function buildBlocPrix(
  apt: Apartment,
  dvf: DvfData | null,
  precision: PrecisionLocalisation | null
): BlocAnalyse {
  const immeuble = isImmeuble(apt.type_bien);
  const faits: Fait[] = [];
  const sources: Source[] = [];
  const donneesManquantes: string[] = [];
  let note: number | null = null;
  const adresseExacte = precision === "exacte";

  const prixM2Achat =
    apt.prix != null && apt.surface_m2 != null && apt.surface_m2 > 0
      ? Math.round((apt.prix + (apt.travaux ?? 0)) / apt.surface_m2)
      : null;

  faits.push({
    label: "Prix/m² du bien",
    value: prixM2Achat,
    unit: "€/m²",
    detail: "achat + travaux",
    source: "Calcul — données du bien",
    gravite: "info",
  });
  if (prixM2Achat == null) donneesManquantes.push("prix ou surface du bien");

  // Invite NON bloquante : le bloc est noté dans les deux cas, l'adresse ne
  // fait que resserrer le périmètre de comparaison. Le texte doit donc
  // proposer un gain de précision, jamais laisser croire que l'analyse est en
  // attente de cette saisie.
  let invite: BlocAnalyse["invite"];
  if (!adresseExacte) {
    invite = {
      text: "Cette comparaison porte sur l'ensemble de la commune (ou de l'arrondissement). Renseigne l'adresse exacte pour la resserrer sur les ventes à moins de 500 m du bien.",
      href: `/appartements/${apt.id}?tab=donnees&edit=1`,
      linkLabel: "Compléter l'adresse",
    };
  }

  // Périmètre RÉELLEMENT interrogé, lu sur la donnée plutôt que redéduit de
  // `precision` : c'est `run.ts` qui arbitre (il retombe sur la commune si le
  // code INSEE manque), et un libellé recalculé ici pourrait annoncer un
  // périmètre que la requête n'a pas utilisé.
  const perimetre = dvf?.perimetreLabel ?? "arrondissement/commune";
  const rayonSerre = dvf?.rayonSerre ?? adresseExacte;

  if (dvf?.medianeRecente != null) {
    sources.push(SRC_DVF);

    if (immeuble) {
      faits.push({
        label: "Comparaison indicative (immeuble)",
        value: null,
        detail:
          "prix/m² comparé à des ventes d'appartements au détail (DVF) — une vente en bloc se négocie souvent 10 à 20 % sous ce prix ; comparaison indicative",
        source: SRC_DVF.label,
        gravite: "attention",
      });
    }

    faits.push({
      label: "Prix/m² médian comparable",
      value: dvf.medianeRecente,
      unit: "€/m²",
      detail: `${dvf.nbVentesRecent} ventes · ${dvf.baseComparaison} · ${dvf.recentMin}–${dvf.recentMax}`,
      perimetre,
      source: SRC_DVF.label,
      gravite: "info",
    });

    if (prixM2Achat != null) {
      const ecart = (prixM2Achat - dvf.medianeRecente) / dvf.medianeRecente;
      const ecartPct = Math.round(ecart * 100);
      const ecartNote = ecart + (immeuble ? DECOTE_BLOC_ATTENDUE : 0);

      faits.push({
        label: "Écart au prix de marché",
        value: `${ecartPct > 0 ? "+" : ""}${ecartPct}`,
        unit: "%",
        detail: immeuble ? "vs médiane appartements · décote de bloc attendue" : "vs médiane comparable",
        perimetre,
        source: SRC_DVF.label,
        gravite: ecartNote <= -0.05 ? "positif" : ecartNote <= 0.05 ? "info" : ecartNote <= 0.15 ? "attention" : "alerte",
      });

      let penalite: number;
      if (ecartNote <= -0.15) penalite = 0;
      else if (ecartNote <= -0.05) penalite = 1;
      else if (ecartNote <= 0.05) penalite = 2;
      else if (ecartNote <= 0.15) penalite = 3;
      else penalite = 4;
      let rawNote = (5 - penalite) * 2;
      // Fiabilité de l'échantillon : avec moins de 15 ventes comparables,
      // la médiane est fragile — on rapproche la note vers la neutralité (5).
      if (dvf.nbVentesRecent < 15) {
        const fiab = dvf.nbVentesRecent / 15;
        rawNote = rawNote * fiab + 5 * (1 - fiab);
      }
      // Fiabilité du PÉRIMÈTRE : une médiane communale situe le secteur, pas
      // la rue. Second facteur d'incertitude, indépendant de la taille de
      // l'échantillon (une commune bien fournie en ventes reste une commune) —
      // d'où deux atténuations qui se composent au lieu de s'exclure.
      if (!rayonSerre) {
        rawNote = rawNote * FIABILITE_QUARTIER + 5 * (1 - FIABILITE_QUARTIER);
      }
      note = clampNote(rawNote);
      if (immeuble) note = Math.min(note, NOTE_MAX_IMMEUBLE);
    }
  } else {
    donneesManquantes.push("ventes DVF comparables dans le secteur");
  }

  const disponible = note != null || faits.length > 0;
  return {
    cle: "prix",
    titre: BLOC_LABELS.prix,
    note,
    poids: BLOC_POIDS.prix,
    disponible,
    faits,
    sources,
    narration: "",
    donneesManquantes,
    invite,
    messageIndisponible: disponible
      ? undefined
      : prixM2Achat == null
        ? "Prix ou surface manquant : impossible de comparer au marché."
        : "Pas assez de ventes DVF récentes dans le secteur pour situer le prix.",
  };
}
