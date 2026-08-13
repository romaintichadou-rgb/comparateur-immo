"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, Info } from "lucide-react";
import { TITRE_SECTION } from "@/components/SectionHeader";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { formatApartmentTitle, formatEuros, sanitizeJustification } from "@/lib/format";
import { isAiEstimated } from "@/lib/estimates";
import { TONE_PANEL_STYLES, type RendementTone, type TonePanelStyle } from "@/lib/analyse/scoring";
import { renderBoldInline, renderMarkdownBold } from "@/components/richText";
import Skeleton from "@/components/Skeleton";
import { lotsEffectifs } from "@/lib/estimates";
import { facteursBaremeEffectifs, phraseSyntheseLoyer } from "@/lib/loyerSynthese";
import {
  MAJORATION_MEUBLE,
  SEUIL_NB_OBS_FIABLE,
  estReferenceFiable,
  referenceCCMeuble,
  typologieAnil,
  type TypologieAnil,
} from "@/lib/anilReference";

const TRANSITION_MS = 300;

/** Libellé lisible de la ressource ANIL réellement lue. */
const TYPOLOGIE_LABEL: Record<TypologieAnil, string> = {
  appartement: "appartement, toutes typologies",
  appartement_t1_t2: "appartement 1-2 pièces",
  appartement_t3_plus: "appartement 3 pièces et +",
  maison: "maison",
};

interface AnilData {
  loyerM2: number;
  min: number;
  max: number;
  nbObs: number;
  annee: number;
  niveauPrediction: "commune" | "epci" | "maille";
  elasticiteLocale: number;
}

export default function LoyerDetailPanel({
  apartment,
  onClose,
}: {
  apartment: ApartmentWithComputed | null;
  onClose: () => void;
}) {
  const [displayed, setDisplayed] = useState<ApartmentWithComputed | null>(null);
  const [show, setShow] = useState(false);
  // Résultat ANIL, gardé avec le `code_insee` qui l'a produit — pas un simple
  // `anil` + `anilLoading` séparés. C'est ce qui permet de savoir, à tout
  // instant, si la donnée AFFICHÉE correspond bien au bien AFFICHÉ : deux
  // états séparés ne peuvent pas distinguer « pas encore chargé pour ce bien »
  // de « chargé, et il n'y a rien » (les deux valent `anil === null`), ce qui
  // laissait passer une frame avec les anciennes données d'un autre bien.
  const [anilResult, setAnilResult] = useState<{ codeInsee: string; data: AnilData | null } | null>(null);
  // Dernier `code_insee` effectivement (re)fetché — évite un aller-retour
  // réseau inutile en réouvrant le panneau sur un bien de la même commune ;
  // un `ref` plutôt que relire `anilResult` dans l'effet, pour ne pas avoir à
  // l'ajouter aux dépendances (il change à cause de CET effet lui-même).
  const anilFetchedForRef = useRef<string | null>(null);

  if (apartment && apartment !== displayed) {
    setDisplayed(apartment);
  }
  if (!apartment && show) {
    setShow(false);
  }

  useEffect(() => {
    if (apartment) {
      const raf = requestAnimationFrame(() => setShow(true));
      return () => cancelAnimationFrame(raf);
    }
    const t = setTimeout(() => setDisplayed(null), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [apartment]);

  // Les quatre entrées de la typologie sont extraites AVANT l'effet, et sont
  // ses dépendances réelles. La liste ne citait que trois d'entre elles :
  // `surface_m2` entre pourtant dans `typologieAnil` (seuil T1-T2 / T3+), donc
  // corriger la surface d'un bien pouvait laisser affichée la référence de
  // l'ancienne typologie.
  const codeInsee = apartment?.code_insee ?? "";
  const typeBien = apartment?.type_bien ?? "";
  const nbPieces = apartment?.nb_pieces ?? null;
  const surfaceM2 = apartment?.surface_m2 ?? null;

  useEffect(() => {
    // Rien à charger, et rien à remettre à zéro : le rendu compare déjà le
    // code INSEE de la référence en mémoire à celui du bien affiché.
    if (!codeInsee) return;
    // La typologie fait partie de la clé : deux biens de la même commune mais
    // de typologies différentes (T2 / T4 / maison) lisent des ressources ANIL
    // distinctes. Sans elle dans la clé, le second réutiliserait la référence
    // du premier — soit jusqu'à 19 % d'écart.
    const typo = typologieAnil(typeBien, nbPieces, isImmeuble(typeBien), surfaceM2);
    const cle = `${codeInsee}|${typo}`;
    if (anilFetchedForRef.current === cle) return;
    anilFetchedForRef.current = cle;
    let cancelled = false;
    fetch(`/api/loyer-reference?code_insee=${encodeURIComponent(codeInsee)}&typologie=${typo}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAnilResult({ codeInsee, data: data.ref ?? null });
      })
      .catch(() => {
        if (!cancelled) setAnilResult({ codeInsee, data: null });
      });
    return () => { cancelled = true; };
  }, [codeInsee, typeBien, nbPieces, surfaceM2]);

  useEffect(() => {
    if (!displayed) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [displayed, onClose]);

  useLayoutEffect(() => {
    if (!displayed) return;
    const html = document.documentElement.style;
    const prev = html.overflow;
    html.overflow = "hidden";
    return () => {
      html.overflow = prev;
    };
  }, [displayed]);

  if (!displayed) return null;

  const apt = displayed;
  const loyer = apt.loyer_retenu;
  const surface = apt.surface_m2;
  const immeuble = isImmeuble(apt.type_bien);
  const hasSurface = surface != null && surface > 0;
  const hasLoyer = loyer != null && loyer > 0;

  // `contentReady` gate : l'Étape 1 dépend d'un fetch réseau (référence ANIL),
  // les étapes 2 et 3 ne dépendent que de données déjà en mémoire
  // (`loyer_justification`, `loyer_retenu`) — donc synchrones. Sans ce garde
  // commun, 2 et 3 s'affichaient IMMÉDIATEMENT tandis que 1 restait en
  // "Chargement…" une fraction de seconde : un panneau à moitié rempli, qui se
  // complète après coup. Les trois étapes apparaissent maintenant D'UN SEUL
  // BLOC, une fois que TOUT est prêt — jamais l'une avant les autres.
  // Quand le bien n'a pas de `code_insee`, il n'y a rien à charger : prêt
  // immédiatement, aucun spinner ne doit apparaître pour rien.
  const contentReady = apt.code_insee === "" || anilResult?.codeInsee === apt.code_insee;
  // ⚠️ La référence en mémoire n'est utilisable que si elle a été chargée POUR
  // CE bien. Sans cette comparaison, ouvrir le panneau sur un bien SANS code
  // INSEE juste après un bien qui en a un afficherait la référence du
  // précédent (`contentReady` est vrai d'emblée dans ce cas). L'effet remettait
  // l'état à zéro pour s'en prémunir — au prix d'un rendu en cascade, là où la
  // comparaison suffit.
  const anil = anilResult?.codeInsee === apt.code_insee ? anilResult.data : null;

  const aiEstimated = isAiEstimated(apt, "loyer_retenu");

  // Conversion ANIL → CC meublé : passe par `anilReference.ts`, la même
  // fonction que le serveur. Le panneau recopiait ses propres constantes, ce
  // qui laissait les deux dériver — c'est ce qui affichait une provision de
  // charges déjà comprise dans le chiffre ANIL.
  const surfaceLogement = hasSurface
    ? immeuble
      ? surface! / lotsEffectifs(apt.nb_lots, surface)
      : surface!
    : null;
  const refCC = anil
    ? referenceCCMeuble(anil, surfaceLogement, typologieAnil(apt.type_bien, apt.nb_pieces, immeuble, apt.surface_m2))
    : null;
  const anilMedian = refCC != null && hasSurface ? Math.round(refCC.medianM2 * surface) : null;
  const anilMinTotal = refCC != null && hasSurface ? Math.round(refCC.minM2 * surface) : null;
  const anilMaxTotal = refCC != null && hasSurface ? Math.round(refCC.maxM2 * surface) : null;

  const ecartPct =
    hasLoyer && anilMedian != null && anilMedian > 0
      ? ((loyer - anilMedian) / anilMedian) * 100
      : null;

  // Détail structuré du résidu IA (Phase 4) — `null` sur les chemins sans
  // résidu (immeuble, logement sans référence ANIL) ou tant qu'aucune
  // estimation IA n'a encore tourné : `Etape2AjustementIa` retombe alors sur
  // la justification en prose (comportement d'avant Phase 4).
  const calcul = apt.loyer_calcul;

  // Recalculée ici plutôt que lue sur `calcul.referenceFiable` : ce dernier
  // peut être absent (aucune estimation IA lancée) ou obsolète (référence
  // ANIL rafraîchie annuellement sans nouvelle estimation) — `anil` est
  // toujours la donnée la plus fraîche affichée dans ce panneau.
  const referenceFiable = anil ? estReferenceFiable(anil.niveauPrediction, anil.nbObs) : true;

  // Facteurs du barème (étage, état×travaux, DPE), tels qu'APPLIQUÉS au moment
  // du calcul — jamais recalculés ici : les coefficients vivent dans
  // `rentEstimation.ts` et les recopier côté client rejouerait la divergence
  // que `anilReference.ts` a été écrit pour supprimer. Fonction PARTAGÉE avec
  // `ApartmentDetail` (section Revenus) — voir `loyerSynthese.ts`.
  const facteursBareme = facteursBaremeEffectifs(calcul, anilMedian);

  // Contexte du bien — TOUTES les caractéristiques, y compris celles sans
  // effet (un étage neutre, un DPE D neutre…), colorée quand elle correspond
  // à un facteur déterministe non neutre (voir `toneEtageEtAscenseur` etc.
  // plus bas). Remplace l'ancien doublon : le fait apparaissait ici en gris
  // ET, séparément, dans un tag "Ajustement automatique" avec son % — une
  // même caractéristique ("Bon état") affichée deux fois, une seule fois
  // colorée. Chaque fait n'apparaît plus qu'UNE fois désormais.
  const { etage: toneEtage, ascenseur: toneAscenseur } = toneEtageEtAscenseur(facteursBareme);
  const toneEtat = toneFacteurPour(facteursBareme, [apt.etat_bien, `${apt.etat_bien} + travaux`, "Travaux prévus"]);
  const toneDpe = apt.dpe ? toneFacteurPour(facteursBareme, [`DPE ${apt.dpe.toUpperCase()}`]) : "neutre";

  const caracteristiquesBien: { label: string; tone: ToneCaracteristique }[] = [];
  if (apt.type_bien) caracteristiquesBien.push({ label: apt.type_bien, tone: "neutre" });
  if (hasSurface) caracteristiquesBien.push({ label: `${surface} m²`, tone: "neutre" });
  if (apt.nb_pieces != null) caracteristiquesBien.push({ label: `${apt.nb_pieces} pièce(s)`, tone: "neutre" });
  if (apt.etage) caracteristiquesBien.push({ label: formatEtageLabel(apt.etage), tone: toneEtage });
  if (apt.ascenseur === true) caracteristiquesBien.push({ label: "ascenseur", tone: toneAscenseur });
  if (apt.etat_bien) caracteristiquesBien.push({ label: apt.etat_bien, tone: toneEtat });
  if (apt.dpe) caracteristiquesBien.push({ label: `DPE ${apt.dpe}`, tone: toneDpe });
  if (apt.travaux != null && apt.travaux > 0) {
    caracteristiquesBien.push({ label: "travaux prévus", tone: toneEtat });
    const toneReno = toneFacteurPour(facteursBareme, ["Rénovation lourde"]);
    if (toneReno !== "neutre") caracteristiquesBien.push({ label: "rénovation lourde", tone: toneReno });
  }

  return (
    <div className="fixed inset-0 z-[2000]">
      <div
        className={`absolute inset-0 bg-ink-900/40 transition-opacity duration-300 ${
          show ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          show ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-6 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
              Détail du calcul du loyer
            </h2>
            <p className="mt-0.5 truncate text-sm text-ink-400">{formatApartmentTitle(apt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="shrink-0 rounded-md p-1.5 text-ink-400 hover:text-ink-500"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!hasLoyer ? (
            <p className="text-sm text-ink-500">
              Aucun loyer renseigné — remplis le champ loyer pour voir le détail.
            </p>
          ) : !contentReady ? (
            <LoyerDetailSkeleton />
          ) : (
            <div className="space-y-5">

              {/* ── ÉTAPE 1 : Ancre ANIL ── */}
              {anil && refCC && anilMedian != null && anilMinTotal != null && anilMaxTotal != null && hasSurface && (() => {
                // ⚠️ Bug réel corrigé après coup, relevé par un utilisateur sur
                // un bien de 43,72 m² (réf. 37 m²) : `anilBrutTotal` multipliait
                // le €/m² DE RÉFÉRENCE (mesuré pour un logement de
                // `surfaceReference` m²) par la surface RÉELLE — un total sans
                // signification, ni pour le logement de référence ni pour ce
                // bien. Pire, le pourcentage affiché juste après ne portait que
                // sur le TAUX (€/m²), jamais sur la surface elle-même : un
                // logement plus grand que la référence affichait un pourcentage
                // NÉGATIF alors que son loyer total, lui, est bien PLUS élevé
                // (plus de m², même si chaque m² individuel coûte un peu moins).
                //
                // Fix : la ligne 1 est le total pour le logement de RÉFÉRENCE
                // (`surfaceReference` m², un nombre qui a un sens : "un
                // {typologie} type de {X} m² dans ce secteur se loue Y €"). La
                // ligne 2 passe directement de CE total à celui de la surface
                // RÉELLE — son pourcentage capture donc l'effet NET (plus de
                // surface ET taux/m² plus bas), qui va dans le sens attendu :
                // un logement plus grand que la référence a un total plus élevé.
                const anilRefTotal = Math.round(anil.loyerM2 * refCC.surfaceReference);
                const anilSurfaceTotal = Math.round(anil.loyerM2 * refCC.facteurSurface * surface);
                const pctSurface = anilRefTotal > 0 ? Math.round((anilSurfaceTotal / anilRefTotal - 1) * 100) : 0;
                return (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className={TITRE_SECTION}>Étape 1 — Référence de marché</h3>
                    {/* Phase 4 (2) : signal discret quand la prédiction ANIL ne
                        vient pas de la commune elle-même, ou repose sur trop
                        peu d'observations — jamais affiché avant. Le loyer de
                        référence reste la meilleure donnée disponible : ce
                        badge relativise, il n'invalide rien. */}
                    {!referenceFiable && (
                      <span
                        className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700"
                        title={raisonFiabiliteReduite(anil)}
                      >
                        Fiabilité réduite
                      </span>
                    )}
                  </div>
                  {/* Progression de VALEURS : chaque ligne est un vrai €/mois
                      pour CE bien, pas un chiffre abstrait corrigé après coup.
                      ⚠️ Il n'y a PAS d'étape « hors charges → charges
                      comprises » : `loypredm2` (ANIL) est DÉJÀ charges
                      comprises. Les libellés le disent comme une PROPRIÉTÉ de
                      la source, jamais comme une marche du calcul — l'ancienne
                      progression « Loyer ANIL non meublé » → « Loyer CC
                      meublé » laissait croire que deux choses avaient changé
                      alors qu'une seule bouge (le meublé). Ne pas réintroduire
                      de provision de charges ici : double comptage de +5 à
                      +12 %, voir anilReference.ts. */}
                  <div className="rounded-lg border border-ink-100 bg-white px-4 py-3">
                    <ul className="divide-y divide-ink-100/50">
                      {/* Le total pour le logement DE RÉFÉRENCE ANIL
                          (`surfaceReference` m²) n'est plus affiché ici — un
                          chiffre basé sur une surface qui n'est pas celle de CE
                          bien, jugé pas assez utile pour occuper une ligne
                          entière (demande explicite). Le détail (surface de
                          référence, effet net) reste disponible, en clair, dans
                          le paragraphe de bas de carte plutôt que dans un
                          tooltip : ce fichier a déjà constaté qu'un `title` seul
                          n'est pas fiable au toucher sur mobile — voir plus bas. */}
                      <StepRow
                        label="Loyer moyen non meublé (CC)"
                        hint={`${TYPOLOGIE_LABEL[refCC.typologie]} · ${surface} m²`}
                        value={anilSurfaceTotal}
                      />
                      <StepRow
                        label="Majoration meublé"
                        pct={Math.round(MAJORATION_MEUBLE * 100)}
                        value={anilMedian}
                        total
                        totalLabel="Loyer de référence meublé (CC)"
                      />
                    </ul>
                    <div className="mt-2.5 flex items-baseline justify-between gap-3 border-t border-ink-100/50 pt-2.5">
                      <span className="text-xs text-ink-400">Fourchette du marché</span>
                      <span className="font-mono text-xs text-ink-500">
                        {formatEuros(anilMinTotal)} – {formatEuros(anilMaxTotal)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Info className="h-3 w-3 text-ink-300 mt-0.5 shrink-0" />
                    <p className="text-[11px] leading-relaxed text-ink-400">
                      Carte des loyers ANIL {anil.annee} · {anil.nbObs.toLocaleString("fr-FR")} annonces observées · loyers <strong className="font-medium">charges comprises</strong>, logement non meublé.
                      {" "}Loyer moyen pour un logement type de {refCC.surfaceReference} m² : {formatEuros(anilRefTotal)}, ajusté à {surface} m² ({pctSurface > 0 ? "+" : ""}{pctSurface} %).
                      {/* Tooltip du badge ci-dessus, en clair : un `title` seul
                          n'est pas fiable au toucher (mobile). */}
                      {!referenceFiable && <> {raisonFiabiliteReduite(anil)}</>}
                    </p>
                  </div>
                </section>
                );
              })()}

              {/* ── ÉTAPE 2 : tout ce qui fait varier le loyer de référence ──
                  Barème déterministe ET résidu IA dans UNE carte, résumés en
                  UNE phrase : l'utilisateur se demande « qu'est-ce qui a fait
                  bouger mon loyer », pas « quel sous-système l'a calculé, et
                  de combien exactement chaque critère ». Refonte (retrait des
                  % par tag + dédoublonnage + phrase de synthèse) : voir
                  docs/reference/estimation-loyer-charges.md. */}
              {aiEstimated && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <h3 className={TITRE_SECTION}>Étape 2 — Ce qui fait varier ce loyer</h3>
                    {/* Même nombre que l'Écart au marché de l'Étape 3 (même
                        apt.loyer_retenu vs anilMedian), coloré avec EXACTEMENT
                        la même fonction (`ecartTone`, pas `pctToneClasses`) —
                        deux teintes différentes pour une seule valeur à
                        quelques centimètres d'écart se liraient comme un bug. */}
                    {ecartPct != null && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${ecartTone(ecartPct, "wrap")} ${ecartTone(ecartPct, "value")}`}
                      >
                        {ecartPct > 0 ? "+" : ""}{ecartPct.toFixed(0)} %
                      </span>
                    )}
                  </div>
                  <div className="space-y-3 rounded-lg border border-ink-100 bg-white p-4">
                    {/* ── Contexte : TOUTES les caractéristiques du bien, effet
                        ou non — colorée quand elle correspond à un facteur
                        déterministe non neutre (voir `toneEtageEtAscenseur`
                        et consorts plus bas), grise sinon. Chaque fait
                        n'apparaît plus qu'UNE fois : avant cette refonte, un
                        fait comme "Bon état" était répété ici EN GRIS puis,
                        séparément, dans un tag "Ajustement automatique" avec
                        son %. */}
                    {caracteristiquesBien.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {caracteristiquesBien.map((c) => (
                          <span
                            key={c.label}
                            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${classesCaracteristique(c.tone)}`}
                          >
                            {c.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {!calcul ? (
                      // Chemins sans résidu structuré (immeuble, logement sans
                      // référence ANIL) : rien à décomposer, on retombe sur la
                      // justification en prose.
                      apt.loyer_justification && (
                        <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600 whitespace-pre-line">
                          {renderBoldInline(sanitizeJustification(apt.loyer_justification, apt.surface_m2, "€/mois", 6))}
                        </div>
                      )
                    ) : (
                      // Phrase de synthèse — remplace l'ancienne liste de tags
                      // "+ X · + Y · + Z" par une vraie phrase, en DEUX
                      // clauses distinctes (barème puis résidu IA) plutôt
                      // qu'une liste fusionnée : la fiabilité des deux sources
                      // reste différente (coefficients reproductibles vs
                      // jugement d'un LLM) — fusionner les MOTS reste
                      // défendable, fusionner la DONNÉE ne l'était pas.
                      <p className="text-sm leading-relaxed text-ink-600">
                        {renderMarkdownBold(phraseSyntheseLoyer(facteursBareme, calcul.criteres, calcul.echecIa))}
                      </p>
                    )}
                  </div>
                </section>
              )}

              {/* ── ÉTAPE 3 : Résultat final ── */}
              <section className="space-y-1.5">
                <h3 className={TITRE_SECTION}>{aiEstimated ? "Étape 3 — " : ""}Loyer retenu</h3>
                <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-accent-50 p-4">
                      <p className="text-xs font-medium text-accent-700">Loyer mensuel CC</p>
                      <p className="mt-1 text-3xl font-bold text-accent-800">
                        {formatEuros(loyer)}
                      </p>
                      <p className="mt-1 text-[11px] text-accent-600">
                        {immeuble ? "total tous lots" : "charges comprises"}
                        {aiEstimated && " · estimation IA"}
                      </p>
                    </div>
                    {ecartPct != null && (
                      <div className={`rounded-xl p-4 ${ecartTone(ecartPct, "wrap")}`}>
                        <p className={`text-xs font-medium ${ecartTone(ecartPct, "label")}`}>Écart au marché</p>
                        <p className={`mt-1 text-3xl font-bold font-mono ${ecartTone(ecartPct, "value")}`}>
                          {ecartPct > 0 ? "+" : ""}{ecartPct.toFixed(0)} %
                        </p>
                        <p className={`mt-1 text-[11px] ${ecartTone(ecartPct, "sub")}`}>
                          référence : {anilMedian != null ? formatEuros(anilMedian) : "n/d"}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Écart du loyer au marché — perspective INVESTISSEUR, logique volontairement
 * inversée par rapport au locataire : au-dessus du marché = bon revenu.
 * C'est la seule exception de ce composant, et elle porte sur les SEUILS.
 * Ne JAMAIS inverser cette logique (voir AGENTS.md).
 *
 * Les COULEURS, elles, ne sont pas une exception : elles viennent de
 * `TONE_PANEL_STYLES` comme toute carte statistique sur fond teinté. Une
 * échelle locale (600/700/500) faisait que cette carte ne s'accordait ni aux
 * panneaux de détail, ni à sa propre carte sœur posée juste à côté dans la
 * même grille.
 */
function ecartTone(pct: number, slot: keyof TonePanelStyle): string {
  let tone: RendementTone;
  // Seuil relevé de 20 à 25 % (audit "booster les critères positifs") : un
  // bien avec plusieurs bons critères LÉGITIMES (état + prestations +
  // quartier) peut désormais atteindre +20-24 % sans rien d'anormal — le
  // résidu IA (RESIDU_MAX=20, rentEstimation.ts) tape simplement son propre
  // plafond. Aligné sur la largeur documentée de la fourchette ANIL
  // elle-même (intervalle de prédiction à 95 %, ±25 % — voir
  // docs/reference/estimation-loyer-charges.md) : au-delà, c'est
  // statistiquement hors norme, en dessous ça reste dans la plage plausible.
  if (pct > 25) tone = "alerte";
  else if (pct >= 0) tone = "positif";
  else if (pct >= -10) tone = "attention";
  else tone = "alerte";

  return TONE_PANEL_STYLES[tone][slot];
}

/**
 * Couleur d'un % signé sur fond BLANC (pas `TONE_PANEL_STYLES`, réservé aux
 * fonds teintés) — utilisée par `StepRow` (Étape 1, majoration meublé) : ce
 * n'est pas un chiffre jugé par un seuil investisseur (comme l'écart au
 * marché de l'Étape 3), juste le signe brut. 0 % n'est ni bon ni mauvais —
 * cas normal — d'où le neutre plutôt qu'une des deux couleurs.
 */
function pctToneClasses(pct: number): string {
  if (pct > 0) return "bg-emerald-50 text-emerald-700";
  if (pct < 0) return "bg-amber-50 text-amber-700";
  return "bg-ink-100 text-ink-500";
}

/**
 * Tonalité d'une caractéristique du bien (pastille de contexte, Étape 2) —
 * NEUTRE par défaut, POSITIF/NÉGATIF quand elle correspond à un facteur
 * déterministe non neutre (`facteursBareme`). Remplace l'ancien doublon : un
 * fait comme "Bon état" apparaissait EN GRIS dans le contexte ET, séparément,
 * dans un tag "Ajustement automatique" avec son % — chaque fait ne s'affiche
 * plus qu'UNE fois, coloré s'il pèse sur le loyer.
 *
 * ⚠️ Couplé au VOCABULAIRE produit par `detailFacteursDeterministes()`
 * (`rentEstimation.ts`) — si ses libellés changent, ce matching doit suivre.
 * Alternative écartée : RECALCULER les coefficients ici recréerait la
 * divergence serveur/client que ce panneau a déjà été corrigé pour éviter
 * (voir plus haut, "jamais recalculé côté client").
 */
type ToneCaracteristique = "positif" | "negatif" | "neutre";

function toneDepuisPct(pct: number): ToneCaracteristique {
  return pct > 0 ? "positif" : pct < 0 ? "negatif" : "neutre";
}

/** Cherche, parmi les facteurs, celui dont le libellé correspond exactement à l'un des `libelles` attendus. */
function toneFacteurPour(facteurs: { libelle: string; pct: number }[], libelles: string[]): ToneCaracteristique {
  const f = facteurs.find((f) => libelles.includes(f.libelle));
  return f ? toneDepuisPct(f.pct) : "neutre";
}

/**
 * Étage et ascenseur partagent UN SEUL facteur déterministe ("3e étage avec
 * ascenseur", "Rez-de-chaussée"...) — les deux pastilles héritent donc de la
 * même tonalité, SAUF au rez-de-chaussée : l'ascenseur n'y est pour rien dans
 * la décote, donc sa pastille reste neutre plutôt que de laisser croire le
 * contraire.
 */
function toneEtageEtAscenseur(
  facteurs: { libelle: string; pct: number }[]
): { etage: ToneCaracteristique; ascenseur: ToneCaracteristique } {
  const rdc = facteurs.find((f) => f.libelle === "Rez-de-chaussée");
  if (rdc) return { etage: toneDepuisPct(rdc.pct), ascenseur: "neutre" };
  const etage = facteurs.find((f) => /étage (avec|sans) ascenseur$/.test(f.libelle));
  if (etage) {
    const tone = toneDepuisPct(etage.pct);
    return { etage: tone, ascenseur: tone };
  }
  return { etage: "neutre", ascenseur: "neutre" };
}

function classesCaracteristique(tone: ToneCaracteristique): string {
  if (tone === "positif") return "bg-emerald-50 text-emerald-700";
  if (tone === "negatif") return "bg-amber-50 text-amber-700";
  return "bg-ink-50 text-ink-600";
}

/** "003" → "3e étage", "0" → "RDC" — nettoyage d'AFFICHAGE uniquement, aucun effet sur le calcul (qui lit `apt.etage` brut). */
function formatEtageLabel(etage: string): string {
  const trimmed = etage.trim();
  // `apt.etage` n'est pas toujours numérique : les parsers y écrivent aussi
  // "RDC" ou "Dernier" en toutes lettres (bookmarklet.ts, parsers/common.ts).
  if (/^rdc$/i.test(trimmed)) return "RDC";
  if (/^dernier$/i.test(trimmed)) return "dernier étage";
  const n = parseInt(trimmed, 10);
  if (isNaN(n)) return `étage ${trimmed}`;
  return n === 0 ? "RDC" : `${n}e étage`;
}

/** Texte, en clair, du badge "Fiabilité réduite" de l'Étape 1 (Phase 4). */
function raisonFiabiliteReduite(anil: AnilData): string {
  const raisons: string[] = [];
  if (anil.niveauPrediction === "maille") {
    raisons.push("estimée à partir de communes voisines similaires, pas de la commune elle-même");
  } else if (anil.niveauPrediction === "epci") {
    raisons.push("estimée au niveau intercommunal, pas communal");
  }
  if (anil.nbObs < SEUIL_NB_OBS_FIABLE) {
    raisons.push(`seulement ${anil.nbObs} annonce${anil.nbObs > 1 ? "s" : ""} observée${anil.nbObs > 1 ? "s" : ""}`);
  }
  return `Référence à relativiser : ${raisons.join(" · ")}.`;
}

/**
 * Squelette du temps où l'Étape 1 (référence ANIL) charge encore. Fidèle à la
 * structure réelle (icône + titre + carte bordée), comme les autres skeletons
 * de l'app (cf. AGENTS.md, section « Skeletons ») — pas une simple barre
 * générique, pour que l'apparition du vrai contenu ne « saute » pas de forme.
 */
function LoyerDetailSkeleton() {
  return (
    <div className="space-y-5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <section key={i} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-lg" />
            <Skeleton className="h-3 w-40" />
          </div>
          <div className="space-y-3 rounded-lg border border-ink-100 bg-white p-4">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        </section>
      ))}
    </div>
  );
}

/**
 * Une marche de la progression de l'Étape 1 : ce qui s'applique (label + son
 * effet en %) et la valeur qui en RÉSULTE. Chaque ligne est donc un vrai
 * €/mois pour ce bien, pas un coefficient abstrait à composer mentalement.
 *
 * La colonne de valeurs est en `font-mono` : des chiffres empilés doivent
 * s'aligner sur leurs unités (chasse fixe), sinon la progression se lit mal —
 * c'est aussi la règle de la charte pour tout chiffre clé.
 */
function StepRow({
  label,
  hint,
  pct,
  value,
  total,
  totalLabel,
}: {
  label: string;
  /** Précision en petit sous le libellé (provenance, surface de référence…). */
  hint?: string;
  /** Effet de cette marche, en % signé. Absent sur la ligne de départ. */
  pct?: number;
  value: number;
  /** Dernière marche : c'est LE chiffre de l'étape, mis en avant. */
  total?: boolean;
  /** Libellé de synthèse affiché à la place de `label` sur la ligne totale. */
  totalLabel?: string;
}) {
  return (
    <li className={`flex items-baseline justify-between gap-3 py-2 ${total ? "border-t border-ink-100" : ""}`}>
      <span className="min-w-0">
        <span className={`block text-sm ${total ? "font-semibold text-ink-900" : "text-ink-600"}`}>
          {total && totalLabel ? totalLabel : label}
        </span>
        {total && totalLabel ? (
          <span className="block text-[11px] text-ink-400">après {label.toLowerCase()}</span>
        ) : hint ? (
          <span className="block text-[11px] text-ink-400">{hint}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-baseline gap-2">
        {pct != null && pct !== 0 && (
          <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${pctToneClasses(pct)}`}>
            {pct > 0 ? "+" : "−"}{Math.abs(pct)} %
          </span>
        )}
        <span className={`font-mono ${total ? "text-base font-bold text-ink-900" : "text-sm font-medium text-ink-700"}`}>
          {formatEuros(value)}
        </span>
      </span>
    </li>
  );
}

