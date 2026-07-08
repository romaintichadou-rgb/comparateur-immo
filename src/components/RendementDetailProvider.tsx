"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApartmentWithComputed } from "@/lib/types";
import { SEUILS_RENDEMENT_DEFAUT, type RendementSeuils } from "@/lib/analyse/scoring";
import RendementDetailPanel from "./RendementDetailPanel";

interface RendementDetailContextValue {
  open: (apartment: ApartmentWithComputed, seuils?: RendementSeuils) => void;
}

interface RendementDetailState {
  apartment: ApartmentWithComputed;
  seuils: RendementSeuils;
}

const RendementDetailContext = createContext<RendementDetailContextValue | null>(null);

/**
 * Monté une seule fois à la racine de l'app (voir layout.tsx) : n'importe
 * quel composant affichant un rendement (table, carte, fiche détaillée,
 * analyse IA…) peut ouvrir le détail du calcul via useRendementDetail(),
 * sans faire remonter d'état local jusqu'à un ancêtre commun. Les seuils
 * sont passés par l'appelant (qui les a déjà, pour sa propre coloration) afin
 * que la couleur du rendement net reste cohérente avec celle affichée en
 * dehors de la modale ; à défaut, on retombe sur les seuils par défaut.
 */
export function RendementDetailProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RendementDetailState | null>(null);

  function open(apartment: ApartmentWithComputed, seuils: RendementSeuils = SEUILS_RENDEMENT_DEFAUT) {
    setState({ apartment, seuils });
  }

  return (
    <RendementDetailContext.Provider value={{ open }}>
      {children}
      <RendementDetailPanel
        apartment={state?.apartment ?? null}
        seuils={state?.seuils ?? SEUILS_RENDEMENT_DEFAUT}
        onClose={() => setState(null)}
      />
    </RendementDetailContext.Provider>
  );
}

export function useRendementDetail(): RendementDetailContextValue {
  const ctx = useContext(RendementDetailContext);
  if (!ctx) {
    throw new Error("useRendementDetail doit être utilisé sous RendementDetailProvider");
  }
  return ctx;
}
