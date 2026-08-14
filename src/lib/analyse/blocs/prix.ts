import { isImmeuble, type Apartment, type PrecisionLocalisation } from "@/lib/types";
import { inviteAdresse, precisionAuMoins } from "../perimetre";
import { SEUIL_ECHANTILLON_FIABLE, type DvfData } from "../sources/dvf";
import { clampNote, interpole } from "../scoring";
import { BLOC_LABELS, BLOC_POIDS, type BlocAnalyse, type Fait, type Source } from "../types";

/**
 * Bloc "Prix d'achat" — 100 % basé sur des transactions réelles (DVF+ Cerema).
 * On compare le prix/m² d'acquisition du bien (prix affiché / surface, hors
 * travaux, pour rester comparable aux prix de vente DVF) à la médiane réelle
 * du secteur, et on affiche l'évolution sur ~10 ans.
 *
 * ⚠️ **La profondeur de la comparaison n'est pas fixe** : la fenêtre DVF est
 * adaptative (dernier millésime seul quand il est assez fourni, sinon on
 * remonte — voir `sources/dvf.ts`). Tout libellé de période doit donc venir de
 * `dvf.recentLabel` ; ne jamais réécrire « sur les 3 dernières années ».
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
 * (`nbVentesRecent < SEUIL_ECHANTILLON_FIABLE`), et pour la même raison : une
 * incertitude réelle se traduit par une note prudente, jamais par une note
 * absente.
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
  const rayonPossible = precisionAuMoins(precision, "rue");

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
  // attente de cette saisie. Formulation commune aux trois blocs concernés :
  // voir `inviteAdresse` (analyse/perimetre.ts).
  const invite = inviteAdresse(apt, precision, {
    requiert: "rue",
    gain: "resserrer la comparaison sur les ventes à moins de 500 m du bien",
  });

  // Périmètre RÉELLEMENT interrogé, lu sur la donnée plutôt que redéduit de
  // `precision` : c'est `run.ts` qui arbitre (il retombe sur la commune si le
  // code INSEE manque), et un libellé recalculé ici pourrait annoncer un
  // périmètre que la requête n'a pas utilisé.
  const perimetre = dvf?.perimetreLabel ?? "arrondissement/commune";
  const rayonSerre = dvf?.rayonSerre ?? rayonPossible;

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
      // Millésimes lus sur la donnée (`recentLabel`), jamais reconstruits ici :
      // la fenêtre est adaptative, sa profondeur change d'un bien à l'autre.
      detail: [`${dvf.nbVentesRecent} ventes`, dvf.baseComparaison, dvf.recentLabel]
        .filter(Boolean)
        .join(" · "),
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

      // Barème CONTINU (voir `interpole`), ancré sur « au prix du marché = 6/10 ».
      //
      // ⚠️ Remplace un escalier à 5 marches (10/8/6/4/2) dont le plancher était
      // atteint dès +15 % : +17 % et +80 % recevaient la même note, et le pas
      // de marche faisait chuter de 4 à 2 entre +14,9 % et +15,1 %.
      //
      // Les deux pentes sont volontairement ASYMÉTRIQUES : une bonne affaire se
      // reconnaît vite (10/10 dès −20 %), une surcote se paie progressivement
      // (0/10 seulement à +40 %). Une surcote de 17 % coûte cher mais n'est pas
      // le pire cas imaginable — c'était précisément le reproche fait au
      // barème précédent.
      let rawNote = interpole(ecartNote, [
        [-0.20, 10], // nettement sous le marché
        [0, 6], //     au prix du marché
        [0.40, 0], //  surcote extrême
      ]);
      // Fiabilité de l'échantillon : sous SEUIL_ECHANTILLON_FIABLE ventes
      // comparables, la médiane est fragile — on rapproche la note vers la
      // neutralité (5). C'est le même seuil qui arrête la fenêtre adaptative
      // côté DVF : la fenêtre s'élargit tant que ce palier n'est pas atteint,
      // et l'atténuation ne joue donc que sur les secteurs où même trois
      // millésimes ne suffisent pas.
      if (dvf.nbVentesRecent < SEUIL_ECHANTILLON_FIABLE) {
        const fiab = dvf.nbVentesRecent / SEUIL_ECHANTILLON_FIABLE;
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
