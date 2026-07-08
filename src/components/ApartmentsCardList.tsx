"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent, formatSurface } from "@/lib/format";
import { RENDEMENT_HOVER_RING, rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { ScoreBadge, STATUT_STYLES, sortApartments, type SortKey } from "@/components/ApartmentsTable";
import { useRendementDetail } from "@/components/RendementDetailProvider";

const RENDEMENT_TEXT_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "text-slate-700",
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
};

/**
 * Équivalent mobile de ApartmentsTable (`sm:hidden`) : le tableau à 8
 * colonnes ne peut pas fonctionner sous ~640px (défilement horizontal sans
 * indice visuel, colonnes clés hors champ). Une carte par bien avec les
 * mêmes informations et actions, en une seule colonne verticale.
 */
export default function ApartmentsCardList({
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
    <div className="space-y-3 sm:hidden">
      {sorted.map((apt) => {
        const tone = rendementNetTone(apt.rendement_net, seuilsRendement);
        return (
          <div
            key={apt.id}
            onClick={() => router.push(`/appartements/${apt.id}`)}
            className={`relative rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition active:bg-slate-50 ${
              deletingId === apt.id ? "opacity-40" : ""
            }`}
          >
            <button
              onClick={(e) => handleDelete(e, apt)}
              disabled={deletingId === apt.id}
              title="Supprimer ce bien"
              aria-label="Supprimer ce bien"
              className="absolute right-2 top-2 rounded-md p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="flex gap-3 pr-8">
              <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-md bg-slate-100">
                {apt.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">—</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{formatApartmentTitle(apt)}</p>
                {apt.adresse ? (
                  <p className="truncate text-xs text-slate-500">{apt.adresse}</p>
                ) : (
                  <p className="truncate text-xs text-slate-400">{apt.plateforme}</p>
                )}
                <p className="truncate text-xs text-slate-400">
                  {[apt.quartier, apt.ville].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-sm">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Prix</p>
                <p className="font-medium text-slate-900">{formatEuros(apt.prix)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Surface</p>
                <p className="font-medium text-slate-900">{formatSurface(apt.surface_m2)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Rendement net</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRendementDetail(apt, seuilsRendement);
                  }}
                  title="Voir le détail du calcul"
                  className={`-mx-1 rounded-md px-1 font-semibold transition ${RENDEMENT_HOVER_RING[tone]} ${RENDEMENT_TEXT_CLASS[tone]}`}
                >
                  {formatPercent(apt.rendement_net)}
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
              <span
                className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${
                  STATUT_STYLES[apt.statut] ?? "bg-slate-100 text-slate-600"
                }`}
              >
                {apt.statut}
              </span>
              <ScoreBadge score={apt.analyse_ia?.score_global ?? null} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
