"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import { formatApartmentTitle, formatEuros, formatPercent } from "@/lib/format";
import { RENDEMENT_HOVER_RING, rendementNetTone, type RendementSeuils } from "@/lib/analyse/scoring";
import { ScoreRing, sortApartments, type SortKey } from "@/components/ApartmentsTable";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useDeleteApartment } from "@/components/useDeleteApartment";

const RENDEMENT_TEXT_CLASS: Record<ReturnType<typeof rendementNetTone>, string> = {
  neutral: "text-ink-700",
  positif: "text-emerald-700",
  attention: "text-amber-700",
  alerte: "text-red-600",
};

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
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { open: openRendementDetail } = useRendementDetail();
  const { requestDelete, deletingId, dialog } = useDeleteApartment(() => router.refresh());

  const sorted = sortApartments(apartments, sortKey);

  function goToApartment(id: string) {
    setNavigatingId(id);
    startTransition(() => router.push(`/appartements/${id}`));
  }

  return (
    <>
    <div className="space-y-3 sm:hidden">
      {sorted.map((apt) => {
        const tone = rendementNetTone(apt.rendement_net, seuilsRendement);
        const score = apt.analyse_ia?.score_global ?? null;
        return (
          <div
            key={apt.id}
            onClick={() => goToApartment(apt.id)}
            className={`relative rounded-lg border bg-white transition-colors active:bg-ink-50 ${
              navigatingId === apt.id ? "border-accent-300 bg-accent-50/50" : "border-ink-200"
            } ${deletingId === apt.id ? "opacity-40" : ""}`}
          >
            {navigatingId === apt.id && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/60">
                <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
              </div>
            )}

            <div className="flex items-start gap-3 p-3 pb-0">
              <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-inset ring-ink-900/5">
                {apt.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-ink-400">—</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink-900">{formatApartmentTitle(apt)}</p>
                <p className="truncate text-xs text-ink-500">
                  {[apt.quartier, apt.ville].filter(Boolean).join(", ") || apt.adresse || apt.plateforme}
                </p>
              </div>
              <div className="shrink-0">
                <ScoreRing score={score} />
              </div>
            </div>

            <div className="mx-3 mt-2 flex items-end gap-2 border-t border-ink-100 py-2.5">
              <div className="grid flex-1 grid-cols-3 gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Prix</p>
                  <p className="font-mono text-sm font-semibold text-ink-900">{formatEuros(apt.prix)}</p>
                  {apt.prix_m2 != null && (
                    <p className="font-mono text-[11px] text-ink-400">{formatEuros(apt.prix_m2)}/m²</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Rdt net</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openRendementDetail(apt, seuilsRendement);
                    }}
                    title="Voir le détail du calcul"
                    className={`-mx-1 rounded-md px-1 font-mono text-sm font-bold transition ${RENDEMENT_HOVER_RING[tone]} ${RENDEMENT_TEXT_CLASS[tone]}`}
                  >
                    {formatPercent(apt.rendement_net)}
                  </button>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-ink-400">Loyer</p>
                  <p className="font-mono text-sm font-semibold text-ink-900">
                    {apt.loyer_retenu ? formatEuros(apt.loyer_retenu) : "—"}
                  </p>
                </div>
              </div>
              <button
                onClick={(e) => requestDelete(e, apt)}
                disabled={deletingId === apt.id}
                title="Supprimer ce bien"
                aria-label="Supprimer ce bien"
                className="shrink-0 rounded-md p-1.5 text-ink-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
    {dialog}
    </>
  );
}
