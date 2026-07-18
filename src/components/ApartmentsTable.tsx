"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent } from "@/lib/format";
import { rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { formatNote } from "@/components/AnalyseIA";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useDeleteApartment } from "@/components/useDeleteApartment";

const RENDEMENT_TEXT_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "text-ink-700",
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
};

// Dégradé du panneau verdict : transparent au niveau du prix, pleinement
// teinté au niveau du rendement — même logique de tons que RENDEMENT_TEXT_CLASS.
const RENDEMENT_GRADIENT_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "",
  positif: "bg-gradient-to-r from-transparent to-emerald-50",
  attention: "bg-gradient-to-r from-transparent to-amber-50",
  alerte: "bg-gradient-to-r from-transparent to-red-50",
};

// Score IA : mêmes seuils que noteHex/noteColorClasses (AnalyseIA.tsx), mais
// exprimés en classes Tailwind pour piloter fond + rail + anneau d'un bloc.
function scoreToneClasses(score: number | null) {
  if (score == null) return { bg: "bg-ink-50", rail: "border-ink-200", text: "text-ink-400", stroke: "stroke-ink-300" };
  if (score >= 8) return { bg: "bg-emerald-50", rail: "border-emerald-400", text: "text-emerald-700", stroke: "stroke-emerald-500" };
  if (score >= 5) return { bg: "bg-amber-50", rail: "border-amber-400", text: "text-amber-700", stroke: "stroke-amber-500" };
  return { bg: "bg-red-50", rail: "border-red-400", text: "text-red-700", stroke: "stroke-red-500" };
}

export type SortKey =
  | "rendement_net"
  | "rendement_brut"
  | "prix"
  | "prix_m2"
  | "surface_m2";

/** Même logique de tri utilisée par la table (desktop) et la liste de cartes
 * (mobile), pour ne jamais les laisser diverger. */
export function sortApartments(
  apartments: ApartmentWithComputed[],
  sortKey: SortKey
): ApartmentWithComputed[] {
  return [...apartments].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    return bv - av;
  });
}

export default function ApartmentsTable({
  apartments,
  sortKey,
  seuilsRendement,
}: {
  apartments: ApartmentWithComputed[];
  sortKey: SortKey;
  seuilsRendement: RendementSeuils;
}) {
  const router = useRouter();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { open: openRendementDetail } = useRendementDetail();
  const { requestDelete, deletingId, dialog } = useDeleteApartment(() => router.refresh());

  const sorted = sortApartments(apartments, sortKey);

  // Retour visuel immédiat au clic : la navigation vers la fiche déclenche un
  // aller-retour serveur (données Supabase). Sans feedback, la ligne semblait
  // inerte le temps du chargement. On marque la ligne cliquée « en cours » dès
  // le clic, et startTransition garde l'état actif jusqu'à l'arrivée de la page.
  function goToApartment(id: string) {
    setNavigatingId(id);
    startTransition(() => router.push(`/appartements/${id}`));
  }

  return (
    <>
    <div className="hidden overflow-x-auto rounded-lg border border-ink-200 bg-white sm:block">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/80 font-mono text-[11px] font-medium uppercase tracking-wide text-ink-500">
            <th className="px-5 py-3 text-left">Bien</th>
            <th className="w-[150px] px-5 py-3 text-center">Prix</th>
            <th className="w-[170px] px-5 py-3 text-center">Rendement net</th>
            <th className="w-[160px] px-5 py-3 text-center">Score IA</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((apt) => {
            const tone = rendementNetTone(apt.rendement_net, seuilsRendement);
            const score = apt.analyse_ia?.score_global ?? null;
            const scoreTone = scoreToneClasses(score);
            return (
              <tr
                key={apt.id}
                onClick={() => goToApartment(apt.id)}
                className={`group cursor-pointer border-b border-ink-100 transition-colors last:border-0 hover:bg-accent-50/40 ${
                  navigatingId === apt.id ? "bg-accent-50/60" : ""
                } ${deletingId === apt.id ? "opacity-40" : ""}`}
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-inset ring-ink-900/5">
                      {apt.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={apt.photo_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-ink-400">
                          —
                        </div>
                      )}
                      {navigatingId === apt.id && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/70">
                          <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
                        </div>
                      )}
                    </div>
                    <div className="max-w-[220px]">
                      <p className="truncate font-medium text-ink-900">
                        {formatApartmentTitle(apt)}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {[apt.quartier, apt.ville].filter(Boolean).join(", ") || apt.adresse || apt.plateforme}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3 text-center leading-tight">
                  <p className="font-mono text-base font-semibold text-ink-900">{formatEuros(apt.prix)}</p>
                  {apt.prix_m2 != null && (
                    <p className="mt-0.5 font-mono text-xs text-ink-400">{formatEuros(apt.prix_m2)}/m²</p>
                  )}
                </td>
                <td className={`px-5 py-3 text-center ${RENDEMENT_GRADIENT_CLASS[tone]}`}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRendementDetail(apt, seuilsRendement);
                    }}
                    title="Voir le détail du calcul"
                    className={`font-mono text-base font-bold transition hover:underline hover:decoration-dotted hover:underline-offset-2 ${RENDEMENT_TEXT_CLASS[tone]}`}
                  >
                    {formatPercent(apt.rendement_net)}
                  </button>
                </td>
                {/* Cellule verdict : fond teinté selon le score, rail de couleur
                    sur l'extrémité droite (border-r), et la suppression logée
                    ici même — plus de colonne blanche dédiée à droite. */}
                <td className={`relative border-r-[3px] py-3 pl-5 pr-4 ${scoreTone.bg} ${scoreTone.rail}`}>
                  <ScoreRing score={score} />
                  <button
                    onClick={(e) => requestDelete(e, apt)}
                    disabled={deletingId === apt.id}
                    title="Supprimer ce bien"
                    aria-label="Supprimer ce bien"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-400 opacity-0 transition-colors hover:bg-white/70 hover:text-red-600 focus:opacity-100 disabled:opacity-50 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    {dialog}
    </>
  );
}

const RING_RADIUS = 17;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function ScoreRing({ score }: { score: number | null }) {
  const tone = scoreToneClasses(score);
  const filled = score == null ? 0 : Math.max(0, Math.min(1, score / 10));
  const offset = RING_CIRCUMFERENCE * (1 - filled);
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      className="mx-auto"
      role="img"
      aria-label={score == null ? "Analyse IA non générée" : `Score global ${formatNote(score)} sur 10`}
    >
      <circle cx="20" cy="20" r={RING_RADIUS} fill="none" strokeWidth="4" className="stroke-ink-200" />
      {score != null && (
        <circle
          cx="20"
          cy="20"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 20 20)"
          className={tone.stroke}
        />
      )}
      <text x="20" y="24" textAnchor="middle" className={`font-mono text-[11px] font-bold ${tone.text}`}>
        {score == null ? "—" : formatNote(score)}
      </text>
    </svg>
  );
}
