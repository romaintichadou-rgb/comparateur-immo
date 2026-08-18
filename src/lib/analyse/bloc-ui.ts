import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  DollarSign,
  Home,
  MapPin,
} from "lucide-react";
import type { BlocKey } from "./types";

export const BLOC_ICON: Record<BlocKey, typeof DollarSign> = {
  prix: DollarSign,
  location: Home,
  risque: AlertTriangle,
  potentiel: CheckCircle2,
  quartier: MapPin,
  simulation: BarChart3,
};

export const BLOC_COLORS: Record<BlocKey, { bg: string; text: string }> = {
  prix: { bg: "bg-emerald-50", text: "text-emerald-600" },
  location: { bg: "bg-accent-50", text: "text-accent-600" },
  risque: { bg: "bg-red-50", text: "text-red-500" },
  potentiel: { bg: "bg-emerald-50", text: "text-emerald-600" },
  quartier: { bg: "bg-accent-50", text: "text-accent-600" },
  simulation: { bg: "bg-amber-50", text: "text-amber-600" },
};

export const BLOC_SUBTITLES: Record<BlocKey, string> = {
  prix: "Comparaison au marché local",
  location: "Rendement et attractivité locative",
  risque: "Réglementation, DPE, copropriété",
  potentiel: "Plus-value et valorisation",
  quartier: "Environnement et commodités",
  simulation: "Cash-flow et fiscalité LMNP",
};
