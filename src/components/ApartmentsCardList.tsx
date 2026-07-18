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
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { open: openRendementDetail } = useRendementDetail();
  const { requestDelete, deletingId, dialog } = useDeleteApartment(() => router.refresh());

  const sorted = sortApartments(apartments, sortKey);

  // Retour visuel immédiat au tap (cf. ApartmentsTable) : navigation = aller-
  // retour serveur, on marque la carte « en cours » dès le tap.
  function goToApartment(id: string) {
    setNavigatingId(id);
    startTransition(() => router.push(`/appartements/${id}`));
  }

  return (
    <>
    <div className="space-y-3 sm:hidden">
      {sorted.map((apt) => {
        const tone = rendementNetTone(apt.rendement_net, seuilsRendement);
        return (
          <div
            key={apt.id}
            onClick={() => goToApartment(apt.id)}
            className={`relative rounded-lg border bg-white p-3.5 transition-colors active:bg-ink-50 ${
              navigatingId === apt.id ? "border-accent-300 bg-accent-50/50" : "border-ink-200"
            } ${deletingId === apt.id ? "opacity-40" : ""}`}
          >
            {navigatingId === apt.id && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/60">
                <Loader2 className="h-6 w-6 animate-spin text-accent-600" />
              </div>
            )}
            <button
              onClick={(e) => requestDelete(e, apt)}
              disabled={deletingId === apt.id}
              title="Supprimer ce bien"
              aria-label="Supprimer ce bien"
              className="absolute right-2 top-2 rounded-md p-1.5 text-ink-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <div className="flex gap-3 pr-8">
              <div className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100 ring-1 ring-inset ring-ink-900/5">
                {apt.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-ink-400">—</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{formatApartmentTitle(apt)}</p>
                {apt.adresse ? (
                  <p className="truncate text-xs text-ink-500">{apt.adresse}</p>
                ) : (
                  <p className="truncate text-xs text-ink-400">{apt.plateforme}</p>
                )}
                <p className="truncate text-xs text-ink-400">
                  {[apt.quartier, apt.ville].filter(Boolean).join(", ") || "—"}
                </p>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-100 pt-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Prix</p>
                <p className="font-mono text-base font-semibold text-ink-900">{formatEuros(apt.prix)}</p>
                {apt.prix_m2 != null && (
                  <p className="font-mono text-xs text-ink-400">{formatEuros(apt.prix_m2)}/m²</p>
                )}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Rendement net</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openRendementDetail(apt, seuilsRendement);
                  }}
                  title="Voir le détail du calcul"
                  className={`-mx-1 rounded-md px-1 font-mono text-base font-bold transition ${RENDEMENT_HOVER_RING[tone]} ${RENDEMENT_TEXT_CLASS[tone]}`}
                >
                  {formatPercent(apt.rendement_net)}
                </button>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Score IA</p>
              <ScoreRing score={apt.analyse_ia?.score_global ?? null} />
            </div>
          </div>
        );
      })}
    </div>
    {dialog}
    </>
  );
}
