"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent, formatSurface } from "@/lib/format";
import { RENDEMENT_HOVER_RING, rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { formatNote, noteHex } from "@/components/AnalyseIA";
import { useRendementDetail } from "@/components/RendementDetailProvider";

const RENDEMENT_TEXT_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "text-ink-700",
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
};

export type SortKey =
  | "rendement_net"
  | "rendement_brut"
  | "prix"
  | "prix_m2"
  | "surface_m2";

export const STATUT_STYLES: Record<string, string> = {
  "à visiter": "bg-blue-50 text-blue-700",
  visité: "bg-violet-50 text-violet-700",
  abandonné: "bg-ink-100 text-ink-500",
  acheté: "bg-emerald-50 text-emerald-700",
};

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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { open: openRendementDetail } = useRendementDetail();

  const sorted = sortApartments(apartments, sortKey);

  async function handleDelete(e: React.MouseEvent, apt: ApartmentWithComputed) {
    e.preventDefault();
    e.stopPropagation();
    const label = formatApartmentTitle(apt);
    if (!window.confirm(`Supprimer définitivement "${label}" ? Cette action est irréversible.`)) {
      return;
    }
    setDeletingId(apt.id);
    try {
      const res = await fetch(`/api/apartments/${apt.id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        setDeletingId(null);
      }
    } catch {
      setDeletingId(null);
    }
  }

  return (
    <div className="hidden overflow-x-auto rounded-2xl border border-ink-200 bg-white shadow-sm sm:block">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/80 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
            <th className="px-4 py-3.5">Bien</th>
            <th className="px-4 py-3.5">Secteur</th>
            <th className="px-4 py-3.5 text-right">Prix</th>
            <th className="px-4 py-3.5 text-right">Surface</th>
            <th className="px-4 py-3.5 text-right">Loyer estimé</th>
            <th className="px-4 py-3.5 text-right">Rendement net</th>
            <th className="px-4 py-3.5 text-center">Score IA</th>
            <th className="px-4 py-3.5">Statut</th>
            <th className="px-2 py-3.5" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((apt) => (
            <tr
              key={apt.id}
              onClick={() => router.push(`/appartements/${apt.id}`)}
              className={`group cursor-pointer border-b border-ink-100 transition-colors last:border-0 hover:bg-accent-50/40 ${
                deletingId === apt.id ? "opacity-40" : ""
              }`}
            >
              <td className="px-4 py-3">
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
                  </div>
                  <div className="max-w-[220px]">
                    <p className="truncate font-medium text-ink-900">
                      {formatApartmentTitle(apt)}
                    </p>
                    {apt.adresse ? (
                      <p className="truncate text-xs text-ink-500">{apt.adresse}</p>
                    ) : (
                      <p className="truncate text-xs text-ink-400">{apt.plateforme}</p>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-ink-600">
                {[apt.quartier, apt.ville].filter(Boolean).join(", ") || "—"}
              </td>
              <td className="px-4 py-3 text-right">
                <p className="font-mono font-medium text-ink-900">{formatEuros(apt.prix)}</p>
                {apt.prix_m2 != null && (
                  <p className="font-mono text-xs text-ink-400">{formatEuros(apt.prix_m2)}/m²</p>
                )}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatSurface(apt.surface_m2)}</td>
              <td className="px-4 py-3 text-right font-mono">{formatEuros(apt.loyer_retenu)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRendementDetail(apt, seuilsRendement);
                  }}
                  title="Voir le détail du calcul"
                  className={`-mx-1.5 -my-0.5 rounded-md px-1.5 py-0.5 font-mono font-semibold transition-colors ${RENDEMENT_HOVER_RING[rendementNetTone(apt.rendement_net, seuilsRendement)]} ${RENDEMENT_TEXT_CLASS[rendementNetTone(apt.rendement_net, seuilsRendement)]}`}
                >
                  {formatPercent(apt.rendement_net)}
                </button>
              </td>
              <td className="px-4 py-3 text-center">
                <ScoreBadge score={apt.analyse_ia?.score_global ?? null} />
              </td>
              <td className="px-4 py-3">
                <span
                  className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                    STATUT_STYLES[apt.statut] ?? "bg-ink-100 text-ink-600"
                  }`}
                >
                  {apt.statut}
                </span>
              </td>
              <td className="px-2 py-3 text-right">
                <button
                  onClick={(e) => handleDelete(e, apt)}
                  disabled={deletingId === apt.id}
                  title="Supprimer ce bien"
                  aria-label="Supprimer ce bien"
                  className="rounded-md p-1.5 text-ink-300 opacity-0 transition-colors hover:bg-signal-50 hover:text-signal-600 focus:opacity-100 disabled:opacity-50 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="text-xs text-ink-400" title="Analyse IA non générée">—</span>;
  }
  const color = noteHex(score);
  return (
    <span
      className="inline-flex items-center justify-center rounded-full px-2 py-1 font-mono text-xs font-semibold"
      style={{ backgroundColor: `${color}1a`, color }}
      title="Score global — Analyse IA"
    >
      {formatNote(score)}/10
    </span>
  );
}
