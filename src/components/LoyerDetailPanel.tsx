"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X, ArrowDown, Info, Sparkles, Database, SlidersHorizontal } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { isImmeuble } from "@/lib/types";
import { formatApartmentTitle, formatEuros, sanitizeJustification } from "@/lib/format";
import { isAiEstimated } from "@/lib/estimates";
import { TONE_PANEL_STYLES, type RendementTone, type TonePanelStyle } from "@/lib/analyse/scoring";
import { AiEstimatedBadge } from "@/components/form/Fields";
import { renderBoldInline } from "@/components/richText";
import Skeleton from "@/components/Skeleton";
import { lotsEffectifs } from "@/lib/estimates";
import {
  MAJORATION_MEUBLE,
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

  const caracteristiques: string[] = [];
  if (apt.type_bien) caracteristiques.push(apt.type_bien);
  if (hasSurface) caracteristiques.push(`${surface} m²`);
  if (apt.nb_pieces != null) caracteristiques.push(`${apt.nb_pieces} pièce(s)`);
  if (apt.etage) caracteristiques.push(`étage ${apt.etage}`);
  if (apt.ascenseur === true) caracteristiques.push("ascenseur");
  if (apt.etat_bien) caracteristiques.push(apt.etat_bien);
  if (apt.dpe) caracteristiques.push(`DPE ${apt.dpe}`);
  if (apt.travaux != null && apt.travaux > 0) caracteristiques.push("travaux prévus");

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
                return (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <Database className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 1 — Référence de marché
                    </h3>
                  </div>
                  <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                    <p className="text-sm text-ink-600">
                      Loyer médian <strong>charges comprises</strong> pour ce type de bien (source ANIL {anil.annee}, {anil.nbObs.toLocaleString("fr-FR")} annonces), majoré de {Math.round(MAJORATION_MEUBLE * 100)} % pour le meublé et ajusté à la surface réelle.
                    </p>
                    <ul className="divide-y divide-ink-100/50 text-sm">
                      <Row label={`Loyer ANIL non meublé (${TYPOLOGIE_LABEL[refCC.typologie]})`} value={anilBrutTotal} suffix="/mois" />
                      <li className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-600">
                        <span>× Majoration meublé</span>
                        <span className="font-medium text-ink-800">+{Math.round(MAJORATION_MEUBLE * 100)} %</span>
                      </li>
                      {/* Le loyer/m² décroît avec la surface (élasticité −0,485
                          mesurée sur les données ANIL) : un studio se loue bien
                          plus cher au m² que la surface de référence. */}
                      {Math.abs(refCC.facteurSurface - 1) > 0.005 && (
                        <li className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-600">
                          <span>× Ajustement surface <span className="text-ink-400">({surface} m² vs {refCC.surfaceReference} m² de référence)</span></span>
                          <span className="font-medium text-ink-800">
                            {refCC.facteurSurface > 1 ? "+" : "−"}{Math.abs(Math.round((refCC.facteurSurface - 1) * 100))} %
                          </span>
                        </li>
                      )}
                      <Row label="Loyer CC meublé (référence)" value={anilMedian} suffix="/mois" bold />
                      <li className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink-600">
                        <span>Fourchette CC</span>
                        <span className="font-medium text-ink-800">
                          {formatEuros(anilMinTotal)} – {formatEuros(anilMaxTotal)}<span className="text-ink-400 text-xs ml-0.5">/mois</span>
                        </span>
                      </li>
                    </ul>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Info className="h-3 w-3 text-ink-300 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-ink-400">
                      Source : Carte des loyers ANIL {anil.annee}, ressource « {TYPOLOGIE_LABEL[refCC.typologie]} » (loyers charges comprises, non meublé) · majoration meublé +{Math.round(MAJORATION_MEUBLE * 100)} % · {surface} m².
                    </p>
                  </div>
                </section>
                );
              })()}

              {/* ── ÉTAPE 2 : Ajustement IA ── */}
              {aiEstimated && (
                <section className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex rounded-lg bg-ink-100 p-1.5 text-ink-500">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                    </span>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                      Étape 2 — Ajustement IA
                    </h3>
                  </div>
                  <div className="rounded-lg border border-ink-100 bg-white p-4 space-y-3">
                    <p className="text-sm text-ink-600">
                      À partir du loyer médian{anilMedian != null && <> (<strong>{formatEuros(anilMedian)}</strong>)</>},
                      l&apos;IA croise <strong>annonces récentes</strong> du secteur et <strong>caractéristiques du bien</strong> pour
                      ajuster le loyer à la hausse ou à la baisse.
                    </p>
                    {caracteristiques.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {caracteristiques.map((c) => (
                          <span
                            key={c}
                            className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600"
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                    {apt.loyer_justification && (
                      <div className="rounded-lg bg-ink-50 p-3 text-sm text-ink-600 whitespace-pre-line">
                        {renderBoldInline(sanitizeJustification(apt.loyer_justification, apt.surface_m2, "€/mois", 6))}
                      </div>
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

function Row({
  label,
  value,
  suffix,
  badge,
  bold,
}: {
  label: string;
  value: number;
  suffix?: string;
  badge?: ReactNode;
  bold?: boolean;
}) {
  return (
    <li className={`flex items-center justify-between gap-3 py-1.5 ${bold ? "border-t border-ink-100 pt-2" : ""}`}>
      <span className={`flex items-center gap-1.5 ${bold ? "font-semibold text-ink-900" : "text-ink-600"}`}>
        {label}
        {badge}
      </span>
      <span className={`shrink-0 ${bold ? "text-base font-bold text-ink-900" : "font-medium text-ink-800"}`}>
        {formatEuros(value)}{suffix ? <span className="text-ink-400 text-xs ml-0.5">{suffix}</span> : null}
      </span>
    </li>
  );
}
