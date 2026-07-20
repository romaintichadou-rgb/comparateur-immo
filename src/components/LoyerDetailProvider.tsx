"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApartmentWithComputed } from "@/lib/types";
import LoyerDetailPanel from "./LoyerDetailPanel";

interface LoyerDetailContextValue {
  open: (apartment: ApartmentWithComputed) => void;
}

const LoyerDetailContext = createContext<LoyerDetailContextValue | null>(null);

export function LoyerDetailProvider({ children }: { children: ReactNode }) {
  const [apartment, setApartment] = useState<ApartmentWithComputed | null>(null);

  return (
    <LoyerDetailContext.Provider value={{ open: setApartment }}>
      {children}
      <LoyerDetailPanel apartment={apartment} onClose={() => setApartment(null)} />
    </LoyerDetailContext.Provider>
  );
}

export function useLoyerDetail(): LoyerDetailContextValue {
  const ctx = useContext(LoyerDetailContext);
  if (!ctx) {
    throw new Error("useLoyerDetail doit être utilisé sous LoyerDetailProvider");
  }
  return ctx;
}
