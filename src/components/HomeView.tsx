"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { RendementSeuils } from "@/lib/analyse/scoring";
import ApartmentsTable, { SortKey } from "./ApartmentsTable";
import ApartmentsCardList from "./ApartmentsCardList";
import EmptyHomeState from "./EmptyHomeState";

// En dessous de ce seuil, la colonne de gauche paraît vide à côté de la carte :
// on la complète par une invitation à ajouter un bien (utile, car comparer
// suppose d'en avoir plusieurs), qui s'étire pour combler le vide sur grand écran.
const FEW_APARTMENTS = 4;

function AddApartmentCard({ count }: { count: number }) {
  return (
    <Link
      href="/appartements/nouveau"
      className="group flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-white/40 px-6 py-8 text-center transition-colors hover:border-accent-400 hover:bg-accent-50/40 xl:min-h-[180px] xl:flex-1"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-white text-ink-400 transition-colors group-hover:border-accent-300 group-hover:text-accent-600">
        <Plus className="h-5 w-5" />
      </span>
      <p className="text-sm font-medium text-ink-700">
        {count === 1 ? "Ajoute un 2ᵉ bien pour commencer à comparer" : "Ajouter un autre bien"}
      </p>
      <p className="text-xs text-ink-400">Colle une URL d&apos;annonce ou saisis les infos à la main</p>
    </Link>
  );
}

const ApartmentsMap = dynamic(() => import("./ApartmentsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-ink-400">
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
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900">
            {apartments.length} bien{apartments.length > 1 ? "s" : ""} suivi
            {apartments.length > 1 ? "s" : ""}
          </h1>
          <p className="mt-0.5 text-sm text-ink-500">
            Trié par {SORT_OPTIONS.find((o) => o.key === sortKey)?.label.toLowerCase()},
            décroissant
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="sort" className="text-ink-500">
            Trier par
          </label>
          <select
            id="sort"
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-ink-300 bg-white px-3 py-2 text-ink-700 transition-colors focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/*
        En dessous de xl, table et carte n'ont pas la place de cohabiter
        (la table a besoin d'~640px minimum) : elles restent empilées, carte
        en haut. À partir de xl, on passe en deux colonnes — table à gauche
        (largeur fluide), carte à droite en colonne fixe, collée en haut de
        viewport (sticky) pour rester visible pendant qu'on parcourt la liste.
        L'ordre DOM (carte puis table) fixe l'empilement mobile sans JS ; les
        classes `order-*` ne font que réarranger visuellement à partir de xl.
      */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="isolate order-1 h-[420px] overflow-hidden rounded-lg border border-ink-200 xl:order-2 xl:sticky xl:top-24 xl:h-[600px]">
          <ApartmentsMap apartments={apartments} seuilsRendement={seuilsRendement} />
        </div>

        <div className="order-2 flex flex-col gap-6 xl:order-1">
          <ApartmentsTable apartments={apartments} sortKey={sortKey} seuilsRendement={seuilsRendement} />
          <ApartmentsCardList apartments={apartments} sortKey={sortKey} seuilsRendement={seuilsRendement} />
          {apartments.length < FEW_APARTMENTS && <AddApartmentCard count={apartments.length} />}
        </div>
      </div>
    </div>
  );
}
