"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import type { ApartmentWithComputed } from "@/lib/types";
import type { CashflowSeuils } from "@/lib/analyse/scoring";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/settings";

const CashflowDetailPanel = dynamic(() => import("./CashflowDetailPanel"));

interface CashflowDetailContextValue {
  open: (
    apartment: ApartmentWithComputed,
    seuils: CashflowSeuils,
    settings: AppSettings
  ) => void;
}

interface CashflowDetailState {
  apartment: ApartmentWithComputed;
  seuils: CashflowSeuils;
  settings: AppSettings;
}

const CashflowDetailContext = createContext<CashflowDetailContextValue | null>(null);

const SEUILS_DEFAUT: CashflowSeuils = { vert: 0, rouge: -200 };

/**
 * Monté une fois à la racine (layout.tsx) : n'importe quel composant affichant
 * un cash-flow (onglet Recommandations…) peut ouvrir le détail du calcul via
 * useCashflowDetail(). Les seuils ET le profil investisseur sont passés par
 * l'appelant — le panneau rejoue `simulate()`, il lui faut donc de quoi
 * résoudre le profil emprunteur hérité, pas seulement de quoi colorer.
 *
 * Volontairement pas de fetch ici : `layout.tsx` est un composant serveur
 * synchrone, le rendre `async` pour y charger les réglages rendrait TOUTES les
 * pages dynamiques. Les deux appelants (`AnalyseIA`, `OptimiserView`) vivent
 * sous `ApartmentDetail`, qui reçoit déjà `settings`.
 */
export function CashflowDetailProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CashflowDetailState | null>(null);

  function open(
    apartment: ApartmentWithComputed,
    seuils: CashflowSeuils,
    settings: AppSettings
  ) {
    setState({ apartment, seuils, settings });
  }

  return (
    <CashflowDetailContext.Provider value={{ open }}>
      {children}
      <CashflowDetailPanel
        apartment={state?.apartment ?? null}
        seuils={state?.seuils ?? SEUILS_DEFAUT}
        settings={state?.settings ?? DEFAULT_SETTINGS}
        onClose={() => setState(null)}
      />
    </CashflowDetailContext.Provider>
  );
}

export function useCashflowDetail(): CashflowDetailContextValue {
  const ctx = useContext(CashflowDetailContext);
  if (!ctx) {
    throw new Error("useCashflowDetail doit être utilisé sous CashflowDetailProvider");
  }
  return ctx;
}
