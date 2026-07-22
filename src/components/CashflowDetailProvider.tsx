"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { CashflowSeuils } from "@/lib/analyse/scoring";
import CashflowDetailPanel from "./CashflowDetailPanel";

interface CashflowDetailContextValue {
  open: (apartment: ApartmentWithComputed, seuils: CashflowSeuils) => void;
}

interface CashflowDetailState {
  apartment: ApartmentWithComputed;
  seuils: CashflowSeuils;
}

const CashflowDetailContext = createContext<CashflowDetailContextValue | null>(null);

const SEUILS_DEFAUT: CashflowSeuils = { vert: 0, rouge: -200 };

/**
 * Monté une fois à la racine (layout.tsx) : n'importe quel composant affichant
 * un cash-flow (onglet Optimiser…) peut ouvrir le détail du calcul via
 * useCashflowDetail(). Les seuils (profil investisseur) sont passés par
 * l'appelant pour que la couleur reste cohérente avec l'affichage.
 */
export function CashflowDetailProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CashflowDetailState | null>(null);

  function open(apartment: ApartmentWithComputed, seuils: CashflowSeuils) {
    setState({ apartment, seuils });
  }

  return (
    <CashflowDetailContext.Provider value={{ open }}>
      {children}
      <CashflowDetailPanel
        apartment={state?.apartment ?? null}
        seuils={state?.seuils ?? SEUILS_DEFAUT}
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
