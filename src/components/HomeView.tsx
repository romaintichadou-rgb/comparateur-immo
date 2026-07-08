"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { ApartmentWithComputed } from "@/lib/types";
import type { RendementSeuils } from "@/lib/analyse/scoring";
import ApartmentsTable, { SortKey } from "./ApartmentsTable";
import ApartmentsCardList from "./ApartmentsCardList";
import EmptyHomeState from "./EmptyHomeState";

const ApartmentsMap = dynamic(() => import("./ApartmentsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-slate-400">
      Chargement de la carte...
    </div>
  ),
});

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "rendement_net", label: "Rendement net" },
  { key: "rendement_brut", label: "Rendement brut" },
  { key: "prix", label: "Prix" },
  { key: "prix_m2", label: "Prix/m²" },
  { key: "surface_m2", label: "Surface" },
];

export default function HomeView({
  apartments,
  seuilsRendement,
}: {
  apartments: ApartmentWithComputed[];
  seuilsRendement: RendementSeuils;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("rendement_net");

  if (apartments.length === 0) {
    return <EmptyHomeState />;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {apartments.length} bien{apartments.length > 1 ? "s" : ""} suivi
            {apartments.length > 1 ? "s" : ""}
          </h1>
          <p className="text-sm text-slate-500">
            Trié par {SORT_OPTIONS.find((o) => o.key === sortKey)?.label.toLowerCase()},
            décroissant
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="sort" className="text-slate-500">
            Trier par
          </label>
          <select
            id="sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-slate-700 shadow-sm focus:border-indigo-500 focus:outline-none"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="h-[420px] overflow-hidden rounded-xl border border-slate-200">
        <ApartmentsMap apartments={apartments} seuilsRendement={seuilsRendement} />
      </div>

      <ApartmentsTable apartments={apartments} sortKey={sortKey} seuilsRendement={seuilsRendement} />
      <ApartmentsCardList apartments={apartments} sortKey={sortKey} seuilsRendement={seuilsRendement} />
    </div>
  );
}
