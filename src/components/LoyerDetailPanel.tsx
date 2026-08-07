"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X, Info, Sparkles, Database, SlidersHorizontal } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { formatApartmentTitle, formatEuros, sanitizeJustification } from "@/lib/format";
import { isAiEstimated } from "@/lib/estimates";
import { TONE_PANEL_STYLES, type RendementTone, type TonePanelStyle } from "@/lib/analyse/scoring";
import { renderBoldInline } from "@/components/richText";
import Skeleton from "@/components/Skeleton";
import { lotsEffectifs } from "@/lib/estimates";
import type { CritereResidu } from "@/lib/rentEstimation";
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

  useEffect(() => {
    if (!apartment) return;
    const codeInsee = apartment.code_insee;
    if (!codeInsee) {
      setAnilResult({ codeInsee: "", data: null });
      return;
    }
    // La typologie fait partie de la clé : deux biens de la même commune mais
    // de typologies différentes (T2 / T4 / maison) lisent des ressources ANIL
    // distinctes. Sans elle dans la clé, le second réutiliserait la référence
    // du premier — soit jusqu'à 19 % d'écart.
    const typo = typologieAnil(apartment.type_bien, apartment.nb_pieces, isImmeuble(apartment.type_bien), apartment.surface_m2);
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
  }, [apartment?.code_insee, apartment?.type_bien, apartment?.nb_pieces]);

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
  const anil = contentReady ? (anilResult?.data ?? null) : null;

  const loyerM2 = hasLoyer && hasSurface ? loyer / surface : null;
  const loyerAnnuel = hasLoyer ? loyer * 12 : null;
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
  // que `anilReference.ts` a été écrit pour supprimer.
  //
  // Repli pour les calculs enregistrés avant ce champ : `loyerDeterministe`
  // (persisté de longue date) porte l'effet GLOBAL du barème par rapport au
  // loyer de référence, qu'on rend alors en un seul tag agrégé.
  const facteursBareme: { libelle: string; pct: number }[] = (() => {
    if (calcul?.facteursDeterministes) return calcul.facteursDeterministes;
    if (!calcul || anilMedian == null || anilMedian <= 0) return [];
    const pct = Math.round((calcul.loyerDeterministe / anilMedian - 1) * 100);
    return pct === 0 ? [] : [{ libelle: "Étage · état · DPE", pct }];
  })();

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
                const anilBrutTotal = Math.round(anil.loyerM2 * surface);
                // Intermédiaire calculé à partir des €/m² NON arrondis : le
                // recomposer depuis `anilBrutTotal` déjà arrondi ferait dériver
                // la chaîne de quelques euros, et la dernière ligne ne
                // retomberait plus sur `anilMedian`.
                const anilSurfaceTotal = Math.round(anil.loyerM2 * refCC.facteurSurface * surface);
                return (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <Database className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 1 — Référence de marché
                    </h3>
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
                      <StepRow
                        label={`Loyer médian ANIL — ${TYPOLOGIE_LABEL[refCC.typologie]}`}
                        hint={`logement de référence ${refCC.surfaceReference} m², ramené à ${surface} m²`}
                        value={anilBrutTotal}
                      />
                      {/* Le loyer/m² décroît avec la surface (élasticité −0,485
                          mesurée sur les données ANIL) : un studio se loue plus
                          cher au m² que la surface de référence, un grand
                          logement moins. */}
                      {Math.abs(refCC.facteurSurface - 1) > 0.005 && (
                        <StepRow
                          label="Ajusté à la surface réelle"
                          pct={Math.round((refCC.facteurSurface - 1) * 100)}
                          value={anilSurfaceTotal}
                        />
                      )}
                      <StepRow
                        label="Majoration meublé"
                        pct={Math.round(MAJORATION_MEUBLE * 100)}
                        value={anilMedian}
                        total
                        totalLabel="Loyer de référence"
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
                      {/* Tooltip du badge ci-dessus, en clair : un `title` seul
                          n'est pas fiable au toucher (mobile). */}
                      {!referenceFiable && <> {raisonFiabiliteReduite(anil)}</>}
                    </p>
                  </div>
                </section>
                );
              })()}

              {/* ── ÉTAPE 2 : tout ce qui fait varier le loyer de référence ──
                  Barème déterministe ET résidu IA dans UNE carte : l'utilisateur
                  se demande « qu'est-ce qui a fait bouger mon loyer », pas « quel
                  sous-système l'a calculé ». L'ancien découpage en deux étapes
                  était calqué sur l'architecture du code (barème → résidu).
                  Les deux familles restent des SOUS-GROUPES distincts, pour deux
                  raisons qui tiennent toujours :
                  - fiabilité : le barème est une table de coefficients
                    reproductible, le résidu est le jugement d'un LLM. L'app badge
                    partout ce qui vient d'une IA, tout aplatir ferait passer une
                    opinion pour une règle ;
                  - granularité : chaque facteur du barème porte SON %, alors que
                    le résidu n'en a qu'un seul pour l'ensemble de ses critères
                    (le % par critère n'existe pas dans les données). */}
              {aiEstimated && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 2 — Ce qui fait varier ce loyer
                    </h3>
                    {/* Total = écart réel entre la référence et le loyer retenu.
                        ⚠️ Ce n'est PAS la somme des tags ci-dessous : les
                        facteurs sont multiplicatifs, bornés, puis suivis du
                        plafonnement sur la fourchette ANIL. Les tags disent ce
                        qui a joué, ce badge dit où on a atterri.
                        ⚠️ Colorisé par `ecartTone` (perspective INVESTISSEUR),
                        pas par `pctToneClasses` : c'est LE MÊME nombre que
                        l'« Écart vs marché » de l'Étape 3, il doit donc porter
                        exactement la même couleur — deux teintes pour une seule
                        valeur à quelques centimètres d'écart se lisent comme un
                        bug. Les badges des familles ci-dessous gardent, eux, la
                        colorisation DIRECTIONNELLE (hausse/baisse) : ils
                        décrivent un effet, pas une position vs marché. */}
                    {ecartPct != null && (
                      <span
                        className={`ml-auto shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${ecartTone(ecartPct, "wrap")} ${ecartTone(ecartPct, "value")}`}
                      >
                        {ecartPct > 0 ? "+" : ""}{ecartPct.toFixed(0)} %
                      </span>
                    )}
                  </div>
                  <div className="space-y-4 rounded-lg border border-ink-100 bg-white p-4">
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
                      <>
                        {/* ── Famille 1 : barème du bien (déterministe) ── */}
                        {facteursBareme.length > 0 && (
                          <FamilleFacteurs
                            titre="Caractéristiques du bien"
                            aide="Barème appliqué automatiquement"
                          >
                            {facteursBareme.map((f) => (
                              <FacteurTag key={f.libelle} label={f.libelle} pct={f.pct} />
                            ))}
                          </FamilleFacteurs>
                        )}

                        {/* ── Famille 2 : critères qualitatifs (résidu IA) ── */}
                        <FamilleFacteurs
                          titre="Analyse IA"
                          aide="Critères qualitatifs non couverts par le barème"
                          badge={
                            !calcul.echecIa ? (
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold ${pctToneClasses(calcul.ajustementPct)}`}
                              >
                                {calcul.ajustementPct > 0 ? "+" : ""}{calcul.ajustementPct} %
                              </span>
                            ) : undefined
                          }
                        >
                          {calcul.echecIa ? (
                            <p className="text-xs text-ink-500">
                              Indisponible pour ce calcul — seul le barème ci-dessus a été appliqué.
                            </p>
                          ) : calcul.criteres.length === 0 ? (
                            <p className="text-xs text-ink-500">
                              Aucun critère marquant — logement conforme à son secteur.
                            </p>
                          ) : (
                            grouperCriteresParCategorie(calcul.criteres).map((groupe, _, groupes) => (
                              <div key={groupe.key} className="contents">
                                {/* Le libellé de catégorie n'apparaît que s'il
                                    DISCRIMINE : avec une seule catégorie il
                                    répète le titre de famille pour rien (cas le
                                    plus fréquent — 3 critères, 1 catégorie). */}
                                {groupes.length > 1 && (
                                  <span className="mt-0.5 w-full text-[10px] font-medium uppercase tracking-wide text-ink-400">
                                    {groupe.label}
                                  </span>
                                )}
                                {groupe.items.map((c, i) => (
                                  <CritereTag key={i} critere={c} />
                                ))}
                              </div>
                            ))
                          )}
                        </FamilleFacteurs>

                        {/* Phase 4 (3) : sans ce texte, un clic sur "Estimer
                            avec IA" qui réutilise le résidu (cache par
                            empreinte, §6) semblerait n'avoir rien fait — un
                            bouton qui ne répond pas plutôt qu'un calcul jugé
                            toujours valide. */}
                        {calcul.reutilise && (
                          <p className="border-t border-ink-100/50 pt-2.5 text-[11px] italic text-ink-400">
                            Résidu IA inchangé depuis la dernière estimation.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </section>
              )}

              {/* ── ÉTAPE 3 : Résultat final ── */}
              <section className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-500">
                    <Sparkles className="h-3.5 w-3.5" />
                  </span>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                    {aiEstimated ? "Étape 3 — " : ""}Loyer retenu
                  </h3>
                </div>
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
                        <p className={`text-xs font-medium ${ecartTone(ecartPct, "label")}`}>Écart vs marché</p>
                        <p className={`mt-1 text-3xl font-bold font-mono ${ecartTone(ecartPct, "value")}`}>
                          {ecartPct > 0 ? "+" : ""}{ecartPct.toFixed(0)} %
                        </p>
                        <p className={`mt-1 text-[11px] ${ecartTone(ecartPct, "sub")}`}>
                          vs {anilMedian != null ? formatEuros(anilMedian) : "médian"}
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
  if (pct > 15) tone = "alerte";
  else if (pct >= 0) tone = "positif";
  else if (pct >= -10) tone = "attention";
  else tone = "alerte";

  return TONE_PANEL_STYLES[tone][slot];
}

/**
 * Catégories du résidu IA — mêmes clés que `SCHEMA_RESIDU.criteres.categorie`
 * (`rentEstimation.ts`), dans l'ordre d'affichage. `autre` est un filet pour
 * une catégorie absente/inattendue (donnée écrite par un LLM) — jamais
 * censé arriver vu le schéma contraint côté serveur, mais un critère ne doit
 * jamais disparaître silencieusement pour autant.
 */
const CATEGORIES: { key: string; label: string }[] = [
  { key: "quartier", label: "Quartier" },
  { key: "prestations", label: "Prestations" },
  { key: "exposition", label: "Exposition" },
  { key: "nuisances", label: "Nuisances" },
  { key: "copropriete", label: "Copropriété" },
  { key: "autre", label: "Autre" },
];

function grouperCriteresParCategorie(
  criteres: CritereResidu[]
): { key: string; label: string; items: CritereResidu[] }[] {
  const parCategorie = new Map<string, CritereResidu[]>();
  for (const c of criteres) {
    const cle = CATEGORIES.some((cat) => cat.key === c.categorie) ? c.categorie! : "autre";
    const liste = parCategorie.get(cle) ?? [];
    liste.push(c);
    parCategorie.set(cle, liste);
  }
  return CATEGORIES
    .map((cat) => ({ ...cat, items: parCategorie.get(cat.key) ?? [] }))
    .filter((groupe) => groupe.items.length > 0);
}

/**
 * Couleur du badge d'ajustement (Étape 2) — PAS `TONE_PANEL_STYLES` : ce n'est
 * pas un chiffre jugé par un seuil investisseur (comme l'écart au marché de
 * l'Étape 3), juste le signe brut renvoyé par l'IA. 0 % n'est ni bon ni
 * mauvais — c'est le cas normal, "conforme au secteur" — d'où le neutre
 * plutôt qu'une des deux couleurs.
 */
function pctToneClasses(pct: number): string {
  if (pct > 0) return "bg-emerald-50 text-emerald-700";
  if (pct < 0) return "bg-amber-50 text-amber-700";
  return "bg-ink-100 text-ink-500";
}

/**
 * Tag d'un critère du résidu. `positif`/`négatif` reprend `emerald`/`amber` —
 * pas `emerald`/`red` : un critère négatif (rez-de-chaussée, vis-à-vis…) pèse
 * un peu sur le loyer, ce n'est pas une alerte au sens de la charte (`red`
 * réservé au danger réel — DPE G, risques, destructif).
 */
function CritereTag({ critere }: { critere: CritereResidu }) {
  const positif = critere.sens === "positif";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
        positif ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      <span aria-hidden="true">{positif ? "+" : "−"}</span>
      {critere.libelle}
    </span>
  );
}

/**
 * Tag d'un facteur DÉTERMINISTE de l'Étape 1 (majoration meublé, ajustement
 * surface) — même langage visuel que `CritereTag` ci-dessus, à dessein : les
 * deux étapes listent des "facteurs qui ont joué", déterministes ici,
 * qualitatifs IA à l'Étape 2. Le pourcentage porte déjà le signe, pas besoin
 * du symbole `+`/`−` séparé de `CritereTag` (qui, lui, n'a qu'un sens sans
 * magnitude).
 */
function FacteurTag({ label, pct }: { label: string; pct: number }) {
  const positif = pct >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium ${
        positif ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {label} {positif ? "+" : "−"}{Math.abs(Math.round(pct))} %
    </span>
  );
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

/**
 * Une famille de facteurs dans la carte « Ce qui fait varier ce loyer » :
 * un intertitre discret + sa grille de tags. Les enfants sont posés dans le
 * MÊME conteneur `flex-wrap` que les tags (d'où le `contents` côté appelant
 * pour les groupes par catégorie) : les tags de toute la famille coulent
 * ensemble et se répartissent naturellement sur 375 px comme sur desktop.
 */
function FamilleFacteurs({
  titre,
  aide,
  badge,
  children,
}: {
  titre: string;
  aide: string;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h4 className="text-xs font-semibold text-ink-700">{titre}</h4>
        {badge}
        <span className="min-w-0 flex-1 truncate text-[11px] text-ink-400">{aide}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}
