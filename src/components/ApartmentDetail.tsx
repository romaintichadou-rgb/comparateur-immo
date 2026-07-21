"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  Calculator,
  HandCoins,
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Gauge,
  Home,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  RotateCcw,
  Sparkles,
  Star,
  User,
  X,
  XCircle,
} from "lucide-react";
import {
  DPE_GES_VALEURS,
  ETATS_BIEN,
  isImmeuble,
  STATUTS,
  TYPES_BIEN,
  type ApartmentPatch,
  type ApartmentWithComputed,
  type Statut,
} from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import {
  estimateAssurance,
  estimateChargesCopro,
  estimateFraisNotaire,
  estimateTaxeFonciere,
  isAiEstimated,
  TF_JUSTIF_COMMUNE_PREFIX,
} from "@/lib/estimates";
import { formatApartmentTitle, formatDate, formatEuros, formatPercent, sanitizeJustification } from "@/lib/format";
import {
  AiEstimatedBadge,
  BooleanField,
  EstimatedBadge,
  ManualBadge,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/Fields";
import AnalyseIA from "@/components/AnalyseIA";
import SyntheseView from "@/components/SyntheseView";
import SimulationFinanciere, { ResultCard } from "@/components/SimulationFinanciere";
import { rendementNetTone, seuilsRendementFromSettings } from "@/lib/analyse/scoring";
import type { AppSettings } from "@/lib/settings";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useLoyerDetail } from "@/components/LoyerDetailProvider";
import { useDeleteApartment } from "@/components/useDeleteApartment";
import Skeleton from "@/components/Skeleton";

const ApartmentLocationMap = dynamic(() => import("./ApartmentLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-ink-100 text-xs text-ink-400">
      Chargement de la carte...
    </div>
  ),
});


function DisplayValue({
  label,
  value,
  suffix,
  badge,
  onEdit,
  onEstimate,
  estimating,
}: {
  label: string;
  value: number | null;
  suffix: string;
  badge?: React.ReactNode;
  onEdit: () => void;
  onEstimate?: () => void;
  estimating?: boolean;
}) {
  const fmt = value != null ? Math.round(value).toLocaleString("fr-FR") : "—";
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-ink-500">{label}</span>
        {badge}
      </div>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-semibold tabular-nums text-ink-800">
          {fmt} <span className="text-sm font-normal text-ink-400">{suffix}</span>
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={onEdit}
            disabled={estimating}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-400 transition-colors hover:bg-accent-50 hover:text-accent-600 disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" />
            Modifier
          </button>
          {onEstimate && (
            <button
              type="button"
              onClick={onEstimate}
              disabled={estimating}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-600 transition-colors hover:bg-amber-50 hover:text-amber-700 disabled:opacity-50"
            >
              {estimating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Estimer avec IA
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function EditableValue({
  label,
  value,
  suffix,
  onCancel,
  onSave,
  onChange,
}: {
  label: string;
  value: number | null;
  suffix: string;
  onCancel: () => void;
  onSave: () => void;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-end gap-1.5">
      <div className="flex-1">
        <NumberField label={label} value={value} onChange={onChange} suffix={suffix} />
      </div>
      <button
        type="button"
        onClick={onSave}
        title="Enregistrer"
        className="mb-[3px] shrink-0 rounded-md bg-accent-600 p-2 text-white transition-colors hover:bg-accent-700"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={onCancel}
        title="Annuler"
        className="mb-[3px] shrink-0 rounded-md p-2 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type Tab = "synthese" | "ia" | "donnees" | "financiere" | "simulation";

const TABS: { key: Tab; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { key: "synthese", label: "Synthèse", icon: Gauge },
  { key: "ia", label: "Analyse IA", icon: Sparkles },
  { key: "donnees", label: "Description du bien", icon: Home },
  { key: "financiere", label: "Détails de l'opération", icon: HandCoins },
  { key: "simulation", label: "Simulation financière", icon: Calculator },
];

// Enregistrer une modification de la description ou de la section Achat déclenche
// un recalcul EN ARRIÈRE-PLAN (non bloquant) : loyer, charges et Analyse IA sont
// rejoués côté serveur pendant que l'utilisateur garde la main, avec un skeleton
// sur les seules données qui se rafraîchissent.
//
// Pipeline ÉLAGUÉ : on ne rejoue que les appels réellement impactés par les
// champs modifiés (ci-dessous). Ex. changer le prix seul → seule l'Analyse IA
// (DVF) est concernée ; le loyer et les charges n'en dépendent pas et ne sont
// pas re-sollicités. Les retouches manuelles de Location/Charges (barre
// "Enregistrer" via finPatch) restent hors de ce flux.
//
// - RENT   : champs qui changent l'estimation de loyer.
// - CHARGES: champs qui changent les charges copro / la taxe foncière.
// - ANALYSIS: champs qui changent un bloc de l'Analyse IA (prix/DVF, rendement,
//   localisation, surface, DPE...).
const RENT_FIELDS = [
  "surface_m2", "type_bien", "nb_lots", "nb_pieces", "nb_chambres", "etage",
  "ascenseur", "annee_construction", "etat_bien", "dpe", "ville", "quartier",
  "code_postal", "adresse", "travaux",
] as const;
const CHARGES_FIELDS = [
  "surface_m2", "ascenseur", "annee_construction", "type_bien", "nb_lots",
  "ville", "quartier", "code_postal", "adresse",
] as const;
const ASSURANCE_FIELDS = [
  "surface_m2", "type_bien", "nb_lots",
] as const;
const ANALYSIS_FIELDS = [
  "prix", "travaux", "frais_notaire_estimes", "surface_m2", "type_bien",
  "nb_lots", "nb_pieces", "nb_chambres", "etage", "ascenseur",
  "annee_construction", "etat_bien", "dpe", "ges", "ville", "quartier",
  "code_postal", "adresse",
] as const;

function computeRecalcNeeds(patch: ApartmentPatch): {
  rent: boolean;
  charges: boolean;
  assurance: boolean;
  analysis: boolean;
} {
  const keys = Object.keys(patch);
  const touches = (fields: readonly string[]) => keys.some((k) => fields.includes(k));
  return {
    rent: touches(RENT_FIELDS),
    charges: touches(CHARGES_FIELDS),
    assurance: touches(ASSURANCE_FIELDS),
    analysis: touches(ANALYSIS_FIELDS),
  };
}

type BannerPhase = "saving" | "success" | "error";
interface BannerState {
  phase: BannerPhase;
  label: string;
}

function useBanner() {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((label: string) => {
    clearTimeout(timerRef.current);
    setBanner({ phase: "saving", label });
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setBanner(null);
  }, []);

  const resolve = useCallback((ok: boolean, label?: string) => {
    clearTimeout(timerRef.current);
    const phase: BannerPhase = ok ? "success" : "error";
    setBanner((prev) => ({ phase, label: label ?? prev?.label ?? "" }));
    timerRef.current = setTimeout(dismiss, ok ? 3000 : 6000);
  }, [dismiss]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { banner, show, resolve, dismiss } as const;
}

const STATUT_STYLES: Record<string, string> = {
  "à visiter": "bg-blue-50 text-blue-700",
  visité: "bg-violet-50 text-violet-700",
  abandonné: "bg-ink-100 text-ink-500",
  acheté: "bg-emerald-50 text-emerald-700",
};

export default function ApartmentDetail({
  apartment: initial,
  settings,
  initialTab,
  initialEdit,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  initialTab?: string;
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const seuilsRendement = seuilsRendementFromSettings(settings);
  const { open: openRendementDetail } = useRendementDetail();
  const { open: openLoyerDetail } = useLoyerDetail();
  // Après suppression depuis la fiche, on quitte vers l'accueil (la fiche
  // n'existe plus) — au lieu du router.refresh() utilisé dans la liste.
  const { requestDelete, dialog: deleteDialog } = useDeleteApartment(() => router.push("/"));
  const [apt, setApt] = useState(initial);
  const [descPatch, setDescPatch] = useState<ApartmentPatch>({});
  const [finPatch, setFinPatch] = useState<ApartmentPatch>({});
  const [achatPatch, setAchatPatch] = useState<ApartmentPatch>({});
  const [editingAchat, setEditingAchat] = useState(false);
  // Recalcul en arrière-plan : quelles données sont en cours de rafraîchissement.
  const [rentPending, setRentPending] = useState(false);
  const [chargesPending, setChargesPending] = useState(false);
  const [analysisPending, setAnalysisPending] = useState(false);
  const [quotaNotice, setQuotaNotice] = useState(false);
  const [editingFields, setEditingFields] = useState<Set<string>>(new Set());
  const [estimatingFields, setEstimatingFields] = useState<Set<string>>(new Set());
  const toggleEdit = useCallback((key: string) => {
    setEditingFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);
  const { banner, show: showBanner, resolve: resolveBanner } = useBanner();
  const [contactNom, setContactNom] = useState(apt.contact_nom);
  const [contactTel, setContactTel] = useState(apt.contact_telephone);
  const [contactEmail, setContactEmail] = useState(apt.contact_email);
  const [notesLocal, setNotesLocal] = useState(apt.notes);
  const searchParams = useSearchParams();
  const spTab = searchParams.get("tab");
  const spEdit = searchParams.get("edit") === "1";
  const resolvedSpTab = TABS.some((t) => t.key === spTab) ? (spTab as Tab) : null;

  const resolvedInitialTab = TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : "synthese";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedSpTab ?? resolvedInitialTab);
  const [editingDesc, setEditingDesc] = useState((resolvedSpTab ?? resolvedInitialTab) === "donnees" && (spEdit || !!initialEdit));

  // Depuis la Synthèse, un CTA de carte renvoie vers l'onglet ET la section
  // concernée (ancre) : on change d'onglet, puis on scrolle vers l'id une fois
  // le nouveau contenu monté (d'où l'effet, pas un scroll synchrone).
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const goToSection = useCallback(
    (tab: Tab, anchor?: string) => {
      setActiveTab(tab);
      router.push(`/appartements/${apt.id}?tab=${tab}`, { scroll: false });
      setPendingScroll(anchor ?? null);
    },
    [router, apt.id]
  );

  useEffect(() => {
    if (resolvedSpTab) {
      setActiveTab(resolvedSpTab);
      if (resolvedSpTab === "donnees" && spEdit) setEditingDesc(true);
    }
  }, [resolvedSpTab, spEdit]);

  useEffect(() => {
    if (!pendingScroll) return;
    // L'onglet cible (ex. Analyse IA) est lourd : son contenu n'est pas monté
    // au moment où l'effet s'exécute. On sonde image par image jusqu'à ce que
    // l'ancre apparaisse, puis on scrolle. Comme la navigation (router.push) et
    // le montage tardif peuvent remettre le scroll à zéro APRÈS notre premier
    // scroll, on repasse deux fois de plus (250 ms, 650 ms) pour verrouiller la
    // position. pendingScroll n'est vidé qu'à la dernière passe (sinon le
    // cleanup annulerait les timers de rattrapage).
    const anchor = pendingScroll;
    let raf = 0;
    let frames = 0;
    const timers: number[] = [];
    const scrollToAnchor = () =>
      document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const attempt = () => {
      if (document.getElementById(anchor)) {
        scrollToAnchor();
        timers.push(window.setTimeout(scrollToAnchor, 250));
        timers.push(
          window.setTimeout(() => {
            scrollToAnchor();
            setPendingScroll(null);
          }, 650)
        );
        return;
      }
      if (frames++ < 60) raf = requestAnimationFrame(attempt);
      else setPendingScroll(null);
    };
    raf = requestAnimationFrame(attempt);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
    };
  }, [pendingScroll, activeTab]);

  const value = <K extends keyof ApartmentWithComputed>(
    patch: ApartmentPatch,
    key: K
  ): ApartmentWithComputed[K] =>
    (key in patch ? (patch as Record<string, unknown>)[key] : apt[key]) as ApartmentWithComputed[K];

  const merged = { ...apt, ...descPatch, ...finPatch, ...achatPatch };
  // Type effectif (édition en cours comprise) : pilote les libellés et les
  // estimations de charges/assurance, qui diffèrent pour un immeuble.
  const immeuble = isImmeuble(merged.type_bien);

  // Tant qu'un champ estimable n'a pas été repris manuellement (badge
  // "estimé" toujours affiché), sa valeur suit en direct les champs dont il
  // dépend — au lieu de rester figée sur l'estimation faite à la création.
  const fraisNotaireManuel =
    apt.champs_manuels.includes("frais_notaire_estimes") || "frais_notaire_estimes" in achatPatch;
  const fraisNotaireLive = fraisNotaireManuel
    ? merged.frais_notaire_estimes
    : estimateFraisNotaire(merged.prix, merged.etat_bien);

  // Un champ estimé par IA (champs_estimes_ia) est lui aussi "figé" pour cet
  // aperçu live : la formule déterministe ne doit pas prendre le pas sur une
  // valeur IA tant que le champ n'est pas explicitement en cours d'édition —
  // même logique que applyLiveEstimates côté serveur (voir estimates.ts).
  const taxeFonciereManuel =
    apt.champs_manuels.includes("taxe_fonciere") || "taxe_fonciere" in finPatch;
  // Une TF communale (taux DGFiP réel) est figée : la recalculer avec la
  // formule départementale (la seule dispo côté client) l'écraserait par une
  // valeur moins précise. Même garde que applyLiveEstimates (voir estimates.ts).
  const tfCommunaleFigee =
    merged.taxe_fonciere != null &&
    !("taxe_fonciere" in finPatch) &&
    (merged.taxe_fonciere_justification ?? "").startsWith(TF_JUSTIF_COMMUNE_PREFIX);
  const taxeFonciereFige = taxeFonciereManuel || tfCommunaleFigee || (apt.champs_estimes_ia.includes("taxe_fonciere") && !("taxe_fonciere" in finPatch));
  const taxeFonciereLive = taxeFonciereFige
    ? merged.taxe_fonciere
    : estimateTaxeFonciere(merged.surface_m2, merged.code_postal, merged.prix);

  const chargesCoproManuel =
    apt.champs_manuels.includes("charges_copro_annuelles") || "charges_copro_annuelles" in finPatch;
  const chargesCoproFige =
    chargesCoproManuel || (apt.champs_estimes_ia.includes("charges_copro_annuelles") && !("charges_copro_annuelles" in finPatch));
  const chargesCoproLive = chargesCoproFige
    ? merged.charges_copro_annuelles
    : estimateChargesCopro(merged.surface_m2, immeuble, merged.code_postal);

  const assuranceManuel =
    apt.champs_manuels.includes("assurance_annuelle") || "assurance_annuelle" in finPatch;
  const assuranceLive = assuranceManuel
    ? merged.assurance_annuelle
    : estimateAssurance(immeuble, merged.nb_lots, merged.surface_m2, merged.type_bien);

  // Recalcule prix/m², budget total et rendements à partir des modifications
  // encore non enregistrées (y compris les estimations ci-dessus), pour un
  // retour immédiat pendant la saisie — ces champs ne dépendent jamais de ce
  // qui est effectivement en base.
  const live = useMemo(
    () =>
      computeDerived({
        ...merged,
        frais_notaire_estimes: fraisNotaireLive,
        taxe_fonciere: taxeFonciereLive,
        charges_copro_annuelles: chargesCoproLive,
        assurance_annuelle: assuranceLive,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apt, descPatch, finPatch, achatPatch, fraisNotaireLive, taxeFonciereLive, chargesCoproLive, assuranceLive]
  );

  async function save(patch: ApartmentPatch, clear: () => void) {
    if (Object.keys(patch).length === 0) return;
    showBanner("Enregistrement des modifications…");
    let ok = false;
    try {
      const res = await fetch(`/api/apartments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        setApt((await res.json()).apartment);
        clear();
        ok = true;
      }
    } catch {}
    resolveBanner(ok, ok ? "Modifications enregistrées" : "Échec de l'enregistrement — réessayez");
  }

  function saveField(key: string) {
    if (!(key in finPatch)) return;
    const fieldPatch = { [key]: (finPatch as Record<string, unknown>)[key] } as ApartmentPatch;
    save(fieldPatch, () => {
      setFinPatch((p) => { const { [key]: _, ...rest } = p as Record<string, unknown>; return rest; });
      setEditingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
    });
  }

  function cancelField(key: string) {
    setEditingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
    setFinPatch((p) => { const { [key]: _, ...rest } = p as Record<string, unknown>; return rest; });
  }

  function estimateFieldAI(key: "loyer_retenu" | "charges_copro_annuelles" | "taxe_fonciere" | "assurance_annuelle") {
    setEstimatingFields((prev) => new Set(prev).add(key));

    if (key === "assurance_annuelle") {
      const val = estimateAssurance(immeuble, merged.nb_lots, merged.surface_m2, merged.type_bien);
      const champsManuels = apt.champs_manuels.filter((c) => c !== "assurance_annuelle");
      const champsEstimesIa = Array.from(new Set([...apt.champs_estimes_ia, "assurance_annuelle" as const]));
      showBanner("Estimation assurance en cours…");
      void (async () => {
        let ok = false;
        try {
          const res = await fetch(`/api/apartments/${apt.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assurance_annuelle: val, champs_manuels: champsManuels, champs_estimes_ia: champsEstimesIa }),
          });
          if (res.ok) { setApt((await res.json()).apartment); ok = true; }
        } catch {}
        setEstimatingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
        resolveBanner(ok, ok ? "Assurance recalculée" : "Échec — réessayez");
      })();
      return;
    }

    const url = key === "loyer_retenu" ? "/api/estimate-rent" : "/api/estimate-charges";
    const body: Record<string, string> = { apartmentId: apt.id };
    if (key !== "loyer_retenu") body.field = key;
    const label = key === "loyer_retenu" ? "loyer" : key === "charges_copro_annuelles" ? "charges copro" : "taxe foncière";
    showBanner(`Estimation IA ${label} en cours…`);
    void (async () => {
      let ok = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          setApt((await res.json()).apartment);
          ok = true;
        }
      } catch {}
      setEstimatingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
      resolveBanner(ok, ok ? `${label.charAt(0).toUpperCase() + label.slice(1)} recalculé` : `Échec de l'estimation ${label} — réessayez`);
    })();
  }

  async function runRecalc(patch: ApartmentPatch) {
    const needs = computeRecalcNeeds(patch);
    setRentPending(needs.rent);
    setChargesPending(needs.charges);
    setAnalysisPending(needs.analysis);

    const steps = [
      needs.rent && "loyer",
      needs.charges && "charges",
      needs.assurance && "assurance",
      needs.analysis && "analyse IA",
    ].filter(Boolean) as string[];

    showBanner("Enregistrement des modifications…");
    let ok = true;

    try {
      const res = await fetch(`/api/apartments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setApt((await res.json()).apartment);
      else ok = false;
    } catch { ok = false; }

    if (needs.rent) {
      showBanner("Recalcul du loyer estimé…");
      try {
        const res = await fetch("/api/estimate-rent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apartmentId: apt.id }),
        });
        if (res.ok) setApt((await res.json()).apartment);
        else ok = false;
      } catch { ok = false; }
    }
    setRentPending(false);

    if (needs.charges) {
      showBanner("Recalcul des charges et taxe foncière…");
      try {
        const res = await fetch("/api/estimate-charges", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apartmentId: apt.id }),
        });
        if (res.ok) setApt((await res.json()).apartment);
        else ok = false;
      } catch { ok = false; }
    }
    setChargesPending(false);

    if (needs.assurance) {
      try {
        const freshRes = await fetch(`/api/apartments/${apt.id}`);
        if (freshRes.ok) {
          const fresh = (await freshRes.json()).apartment;
          const imm = isImmeuble(fresh.type_bien);
          const val = estimateAssurance(imm, fresh.nb_lots, fresh.surface_m2, fresh.type_bien);
          const champsManuels = fresh.champs_manuels.filter((c: string) => c !== "assurance_annuelle");
          const champsEstimesIa = Array.from(new Set([...fresh.champs_estimes_ia, "assurance_annuelle"]));
          const patchRes = await fetch(`/api/apartments/${apt.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assurance_annuelle: val, champs_manuels: champsManuels, champs_estimes_ia: champsEstimesIa }),
          });
          if (patchRes.ok) setApt((await patchRes.json()).apartment);
          else ok = false;
        }
      } catch { ok = false; }
    }

    if (needs.analysis) {
      showBanner("Relance de l'analyse IA — scores et narration…");
      try {
        const res = await fetch(`/api/analyse/${apt.id}`, { method: "POST" });
        if (res.ok) setApt((await res.json()).apartment);
        else ok = false;
      } catch { ok = false; }
    }
    setAnalysisPending(false);

    const updated = steps.join(", ").replace(/, ([^,]+)$/, " et $1");
    resolveBanner(ok,
      ok ? `Tout est à jour — ${updated} recalculé${steps.length > 1 ? "s" : ""}`
         : "Certaines mises à jour ont échoué — réessayez manuellement");
  }

  async function handleSaveDesc() {
    const patch = descPatch;
    if (Object.keys(patch).length === 0) {
      setEditingDesc(false);
      return;
    }
    // Optimiste : on affiche tout de suite les valeurs saisies + les calculs
    // instantanés (budget, prix/m², rendement) sans attendre le serveur.
    setApt((prev) => computeDerived({ ...prev, ...patch }));
    setDescPatch({});
    setEditingDesc(false);
    void runRecalc(patch);
  }

  function handleCancelDesc() {
    setDescPatch({});
    setEditingDesc(false);
  }

  // Section Achat (prix, travaux, frais de notaire) : même geste que la
  // description — sortie immédiate du mode édition, valeurs instantanées
  // affichées, et recalcul (loyer/charges/analyse selon impact) en arrière-plan.
  async function handleSaveAchat() {
    const patch = achatPatch;
    if (Object.keys(patch).length === 0) {
      setEditingAchat(false);
      return;
    }
    setApt((prev) => computeDerived({ ...prev, ...patch }));
    setAchatPatch({});
    setEditingAchat(false);
    void runRecalc(patch);
  }

  function handleCancelAchat() {
    setAchatPatch({});
    setEditingAchat(false);
  }

  // Sauvegarde immédiate, sans bouton "Enregistrer" — pour les réglages
  // rapides de la colonne de droite (statut, coup de cœur, contact).
  async function patchNow(patch: ApartmentPatch) {
    const res = await fetch(`/api/apartments/${apt.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { apartment } = await res.json();
      setApt(apartment);
    }
  }

  function commitContact(key: "contact_nom" | "contact_telephone" | "contact_email", current: string) {
    if (current === apt[key]) return;
    patchNow({ [key]: current });
  }

  function commitNotes() {
    if (notesLocal === apt.notes) return;
    patchNow({ notes: notesLocal });
  }

  function fireEstimation(
    url: string,
    msgs: { saving: string; success: string; error: string },
    setPending: (b: boolean) => void,
    onSuccess?: (data: Record<string, unknown>) => void,
  ) {
    setPending(true);
    showBanner(msgs.saving);
    void (async () => {
      let ok = false;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apartmentId: apt.id }),
        });
        if (res.ok) {
          const data = await res.json();
          setApt(data.apartment);
          onSuccess?.(data);
          ok = true;
        }
      } catch {}
      setPending(false);
      resolveBanner(ok, ok ? msgs.success : msgs.error);
    })();
  }

  function handleRelancerAnalyse() {
    setQuotaNotice(false);
    fireEstimation(`/api/analyse/${apt.id}`, {
      saving: "Relance de l'analyse IA — collecte des données et scoring…",
      success: "Analyse IA terminée — scores et narration mis à jour",
      error: "Échec de l'analyse IA — réessayez",
    }, setAnalysisPending, (data) => {
      setQuotaNotice(data.narrationStatus === "quota");
    });
  }

  const finDirty = Object.keys(finPatch).length > 0;
  const rendementPending = rentPending || chargesPending;
  const recalcInFlight = rentPending || chargesPending || analysisPending || estimatingFields.size > 0;
  const localisation = apt.adresse || [apt.quartier, apt.ville].filter(Boolean).join(", ");
  const hasCoords = Number.isFinite(apt.latitude) && Number.isFinite(apt.longitude);
  const localisationApproximative = apt.precision_localisation === "arrondissement";

  return (
    <>
    {banner && <StickyBanner phase={banner.phase} label={banner.label} />}
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la liste
      </Link>

      {/* En-tête */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Photo */}
          <div className="relative h-56 min-w-0 flex-1 overflow-hidden rounded-xl border border-ink-200 sm:h-72">
            {apt.photo_url ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                  <h1 className="font-display text-2xl font-semibold text-white sm:text-3xl">
                    {formatApartmentTitle(apt)}
                  </h1>
                  {localisation && <p className="mt-1 text-sm text-white/85">{localisation}</p>}
                </div>
              </>
            ) : (
              <div className="flex h-full flex-col justify-center bg-ink-50 p-5 sm:p-6">
                <h1 className="font-display text-2xl font-semibold text-ink-900 sm:text-3xl">
                  {formatApartmentTitle(apt)}
                </h1>
                {localisation && <p className="mt-1 text-sm text-ink-500">{localisation}</p>}
              </div>
            )}
          </div>

          {/* Carte */}
          <div className="relative isolate h-56 w-full shrink-0 overflow-hidden rounded-xl border border-ink-200 sm:h-72 sm:w-72">
            {hasCoords ? (
              <ApartmentLocationMap
                latitude={apt.latitude!}
                longitude={apt.longitude!}
                approximatif={localisationApproximative}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-1.5 bg-ink-50 text-ink-400">
                <MapPin className="h-5 w-5" />
                <span className="text-xs">Localisation indisponible</span>
              </div>
            )}
            {hasCoords && localisationApproximative && (
              <span className="pointer-events-none absolute bottom-2 left-2 z-[1000] rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-medium text-amber-600 shadow-sm">
                Position approximative
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 py-2 text-sm text-ink-500">
          <span>Ajouté le {formatDate(apt.date_ajout)}</span>
          <span>·</span>
          <span>{apt.plateforme}</span>
          {apt.url && (
            <>
              <span>·</span>
              <a
                href={apt.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent-600 hover:text-accent-800"
              >
                Voir l&apos;annonce <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
          {/* Action destructive discrète, repoussée à droite : présente sans
              jamais concurrencer les actions principales de la fiche. */}
          <button
            type="button"
            onClick={(e) => requestDelete(e, apt)}
            className="ml-auto text-ink-400 underline decoration-ink-200 underline-offset-2 transition-colors hover:text-red-600 hover:decoration-red-300"
          >
            Supprimer ce bien
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-ink-200">
        <nav className="-mx-4 flex gap-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/appartements/${apt.id}?tab=${tab.key}`}
              onClick={(e) => {
                e.preventDefault();
                setActiveTab(tab.key);
                router.push(`/appartements/${apt.id}?tab=${tab.key}`, { scroll: false });
              }}
              className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-accent-600 text-accent-600"
                  : "border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              <tab.icon className="size-4" />
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      {activeTab === "synthese" && (
        analysisPending ? (
          <SyntheseSkeleton />
        ) : (
          <SyntheseView
            apartment={apt}
            seuilsRendement={seuilsRendement}
            onGoTab={goToSection}
            onRelancer={handleRelancerAnalyse}
          />
        )
      )}

      {activeTab === "ia" && (
        analysisPending ? (
          <AnalyseIASkeleton />
        ) : (
          <AnalyseIA apartment={apt} seuilsRendement={seuilsRendement} onAnalysed={setApt} onRelancer={handleRelancerAnalyse} quotaNotice={quotaNotice} />
        )
      )}

      {activeTab === "financiere" && (
        <div className="space-y-6">
          {/* Résultat principal : la rentabilité au premier coup d'œil */}
          <div id="fin-resultats" className="grid scroll-mt-24 grid-cols-1 gap-3 sm:grid-cols-3">
            <ResultCard
              label="Budget total de l'opération"
              sub="achat + notaire + travaux"
              value={formatEuros(live.budget_total)}
              tone="neutral"
            />
            <ResultCard
              label="Loyer mensuel CC"
              sub={isAiEstimated(apt, "loyer_retenu") ? "estimation IA" : "charges comprises"}
              value={formatEuros(live.loyer_retenu)}
              tone="neutral"
              loading={rentPending}
              onClick={() => openLoyerDetail(live)}
            />
            <ResultCard
              label="Rendement net"
              sub="après charges, hors crédit et fiscalité"
              value={formatPercent(live.rendement_net)}
              tone={rendementNetTone(live.rendement_net, seuilsRendement)}
              emphase
              loading={rendementPending}
              onClick={() => openRendementDetail(live, seuilsRendement)}
            />
          </div>

          {finDirty && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-accent-50 px-4 py-2.5">
              <p className="text-xs text-accent-700">Modifications non enregistrées.</p>
              <button
                onClick={() => save(finPatch, () => setFinPatch({}))}
                disabled={banner?.phase === "saving"}
                className="shrink-0 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {banner?.phase === "saving" ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          )}

          <section id="fin-achat" className="space-y-4 scroll-mt-24 rounded-xl border border-ink-200 bg-white p-5">
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
                    <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Banknote className="h-3.5 w-3.5" /></span>
                    Achat
                  </h2>
                  {editingAchat ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={handleCancelAchat}
                        className="rounded-md border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveAchat}
                        className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingAchat(true)}
                      className="shrink-0 rounded-md border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {editingAchat ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <NumberField label="Prix" value={value(achatPatch, "prix")} onChange={(v) => setAchatPatch((p) => ({ ...p, prix: v }))} suffix="€" />
                    <NumberField
                      label="Travaux"
                      value={value(achatPatch, "travaux")}
                      onChange={(v) => setAchatPatch((p) => ({ ...p, travaux: v }))}
                      suffix="€"
                    />
                    <div className="sm:col-span-2">
                      <NumberField
                        label="Frais de notaire"
                        value={fraisNotaireLive}
                        onChange={(v) => setAchatPatch((p) => ({ ...p, frais_notaire_estimes: v }))}
                        suffix="€"
                        hint={!fraisNotaireManuel && fraisNotaireLive != null && <EstimatedBadge />}
                      />
                    </div>
                    <ReadOnlyField label="Budget total (calculé)" value={formatEuros(live.budget_total)} />
                    <ReadOnlyField label="Prix / m² — achat + travaux (calculé)" value={formatEuros(live.prix_m2)} />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <ReadOnlyField label="Prix" value={formatEuros(apt.prix)} />
                    <ReadOnlyField label="Travaux" value={apt.travaux != null ? formatEuros(apt.travaux) : "—"} />
                    <ReadOnlyField
                      label="Frais de notaire"
                      value={fraisNotaireLive == null ? "—" : formatEuros(fraisNotaireLive)}
                      badge={!fraisNotaireManuel && fraisNotaireLive != null && <EstimatedBadge />}
                    />
                    <ReadOnlyField label="Budget total (calculé)" value={formatEuros(live.budget_total)} />
                    <ReadOnlyField label="Prix / m² — achat + travaux (calculé)" value={formatEuros(live.prix_m2)} />
                  </div>
                )}
          </section>

          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><KeyRound className="h-3.5 w-3.5" /></span>
              Location
            </h2>
            {rentPending ? (
              <div className="space-y-3">
                <PendingFieldLabel label="Loyer mensuel, charges comprises" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-16 w-full rounded-md" />
              </div>
            ) : (
              <>
                {!editingFields.has("loyer_retenu") && !("loyer_retenu" in finPatch) ? (
                  <DisplayValue
                    label="Loyer mensuel, charges comprises"
                    value={apt.loyer_retenu}
                    suffix="€/mois CC"
                    badge={isAiEstimated(apt, "loyer_retenu") ? <AiEstimatedBadge /> : apt.champs_manuels.includes("loyer_retenu") ? <ManualBadge /> : apt.loyer_retenu != null ? <EstimatedBadge /> : undefined}
                    onEdit={() => {
                      toggleEdit("loyer_retenu");
                      setFinPatch((p) => ({ ...p, loyer_retenu: apt.loyer_retenu }));
                    }}
                    onEstimate={() => estimateFieldAI("loyer_retenu")}
                    estimating={estimatingFields.has("loyer_retenu")}
                  />
                ) : (
                  <EditableValue
                    label="Loyer mensuel, charges comprises"
                    value={value(finPatch, "loyer_retenu")}
                    suffix="€/mois CC"
                    onChange={(v) => setFinPatch((p) => ({ ...p, loyer_retenu: v }))}
                    onSave={() => saveField("loyer_retenu")}
                    onCancel={() => cancelField("loyer_retenu")}
                  />
                )}
                {apt.loyer_justification && !editingFields.has("loyer_retenu") && !("loyer_retenu" in finPatch) && (
                  <p className="rounded-md bg-ink-50 p-3 text-xs text-ink-600 whitespace-pre-line">
                    {renderBoldInline(sanitizeJustification(apt.loyer_justification, apt.surface_m2, "€/mois", 6))}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => openLoyerDetail(live)}
                  className="text-left text-xs font-medium text-accent-600 hover:text-accent-800"
                >
                  Détails du calcul
                </button>
              </>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><ReceiptText className="h-3.5 w-3.5" /></span>
              Charges annuelles
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                {chargesPending ? (
                  <>
                    <PendingFieldLabel label={immeuble ? "Charges d'exploitation annuelles" : "Charges copro annuelles"} />
                    <Skeleton className="mt-1.5 h-10 w-full rounded-md" />
                    <Skeleton className="mt-2 h-16 w-full rounded-md" />
                  </>
                ) : !editingFields.has("charges_copro_annuelles") && !("charges_copro_annuelles" in finPatch) ? (
                  <>
                    <DisplayValue
                      label={immeuble ? "Charges d'exploitation annuelles" : "Charges copro annuelles"}
                      value={chargesCoproLive}
                      suffix="€/an"
                      badge={isAiEstimated(apt, "charges_copro_annuelles") ? <AiEstimatedBadge /> : apt.champs_manuels.includes("charges_copro_annuelles") ? <ManualBadge /> : chargesCoproLive != null ? <EstimatedBadge /> : undefined}
                      onEdit={() => {
                        toggleEdit("charges_copro_annuelles");
                        setFinPatch((p) => ({ ...p, charges_copro_annuelles: chargesCoproLive }));
                      }}
                      onEstimate={() => estimateFieldAI("charges_copro_annuelles")}
                      estimating={estimatingFields.has("charges_copro_annuelles")}
                    />
                    {apt.charges_justification && (
                      <p className="mt-2 rounded-md bg-ink-50 p-3 text-xs text-ink-600 whitespace-pre-line">{renderBoldInline(sanitizeJustification(apt.charges_justification, apt.surface_m2, "€/an"))}</p>
                    )}
                  </>
                ) : (
                  <EditableValue
                    label={immeuble ? "Charges d'exploitation annuelles" : "Charges copro annuelles"}
                    value={chargesCoproLive}
                    suffix="€/an"
                    onChange={(v) => setFinPatch((p) => ({ ...p, charges_copro_annuelles: v }))}
                    onSave={() => saveField("charges_copro_annuelles")}
                    onCancel={() => cancelField("charges_copro_annuelles")}
                  />
                )}
              </div>
              <div>
                {chargesPending ? (
                  <>
                    <PendingFieldLabel label="Taxe foncière" />
                    <Skeleton className="mt-1.5 h-10 w-full rounded-md" />
                    <Skeleton className="mt-2 h-16 w-full rounded-md" />
                  </>
                ) : !editingFields.has("taxe_fonciere") && !("taxe_fonciere" in finPatch) ? (
                  <>
                    <DisplayValue
                      label="Taxe foncière"
                      value={taxeFonciereLive}
                      suffix="€/an"
                      badge={isAiEstimated(apt, "taxe_fonciere") ? <AiEstimatedBadge /> : apt.champs_manuels.includes("taxe_fonciere") ? <ManualBadge /> : taxeFonciereLive != null ? <AiEstimatedBadge /> : undefined}
                      onEdit={() => {
                        toggleEdit("taxe_fonciere");
                        setFinPatch((p) => ({ ...p, taxe_fonciere: taxeFonciereLive }));
                      }}
                      onEstimate={() => estimateFieldAI("taxe_fonciere")}
                      estimating={estimatingFields.has("taxe_fonciere")}
                    />
                    {apt.taxe_fonciere_justification && (
                      <p className="mt-2 rounded-md bg-ink-50 p-3 text-xs text-ink-600 whitespace-pre-line">{renderBoldInline(sanitizeJustification(apt.taxe_fonciere_justification, apt.surface_m2, "€/an"))}</p>
                    )}
                  </>
                ) : (
                  <EditableValue
                    label="Taxe foncière"
                    value={taxeFonciereLive}
                    suffix="€/an"
                    onChange={(v) => setFinPatch((p) => ({ ...p, taxe_fonciere: v }))}
                    onSave={() => saveField("taxe_fonciere")}
                    onCancel={() => cancelField("taxe_fonciere")}
                  />
                )}
              </div>
              <div>
                {!editingFields.has("assurance_annuelle") && !("assurance_annuelle" in finPatch) ? (
                  <DisplayValue
                    label="Assurance"
                    value={assuranceLive}
                    suffix="€/an"
                    badge={isAiEstimated(apt, "assurance_annuelle") ? <AiEstimatedBadge /> : apt.champs_manuels.includes("assurance_annuelle") ? <ManualBadge /> : assuranceLive != null ? <AiEstimatedBadge /> : undefined}
                    onEdit={() => {
                      toggleEdit("assurance_annuelle");
                      setFinPatch((p) => ({ ...p, assurance_annuelle: assuranceLive }));
                    }}
                    onEstimate={() => estimateFieldAI("assurance_annuelle")}
                    estimating={estimatingFields.has("assurance_annuelle")}
                  />
                ) : (
                  <EditableValue
                    label="Assurance"
                    value={assuranceLive}
                    suffix="€/an"
                    onChange={(v) => setFinPatch((p) => ({ ...p, assurance_annuelle: v }))}
                    onSave={() => saveField("assurance_annuelle")}
                    onCancel={() => cancelField("assurance_annuelle")}
                  />
                )}
              </div>
              <div>
                {!editingFields.has("hypothese_gestion_pct") && !("hypothese_gestion_pct" in finPatch) ? (
                  <DisplayValue
                    label="Frais de gestion locative"
                    value={apt.hypothese_gestion_pct}
                    suffix="% du loyer"
                    onEdit={() => {
                      toggleEdit("hypothese_gestion_pct");
                      setFinPatch((p) => ({ ...p, hypothese_gestion_pct: apt.hypothese_gestion_pct }));
                    }}
                  />
                ) : (
                  <EditableValue
                    label="Frais de gestion locative"
                    value={value(finPatch, "hypothese_gestion_pct")}
                    suffix="% du loyer"
                    onChange={(v) => setFinPatch((p) => ({ ...p, hypothese_gestion_pct: v ?? 0 }))}
                    onSave={() => saveField("hypothese_gestion_pct")}
                    onCancel={() => cancelField("hypothese_gestion_pct")}
                  />
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === "simulation" && (
        <SimulationFinanciere
          apartment={live}
          settings={settings}
          onSaved={setApt}
          onPatchApartment={async (patch) => {
            const optimistic = { ...apt, ...patch } as ApartmentWithComputed;
            setApt(computeDerived(optimistic));
            const res = await fetch(`/api/apartments/${apt.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patch),
            });
            if (res.ok) {
              const { apartment: updated } = await res.json();
              setApt(updated);
            }
          }}
        />
      )}

      {activeTab === "donnees" && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Colonne principale */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-6">
            <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
                    <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><Home className="h-3.5 w-3.5" /></span>
                    Description du bien
                  </h2>
                  {editingDesc ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={handleCancelDesc}
                        className="rounded-md border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveDesc}
                        className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
                      >
                        Enregistrer
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingDesc(true)}
                      className="shrink-0 rounded-md border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
                    >
                      Modifier
                    </button>
                  )}
                </div>

                {editingDesc ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <TextField label="Ville" value={value(descPatch, "ville")} onChange={(v) => setDescPatch((p) => ({ ...p, ville: v }))} />
                      <TextField label="Quartier" value={value(descPatch, "quartier")} onChange={(v) => setDescPatch((p) => ({ ...p, quartier: v }))} />
                      <TextField label="Adresse" value={value(descPatch, "adresse")} onChange={(v) => setDescPatch((p) => ({ ...p, adresse: v }))} />
                      <SelectField label="Type de bien" value={value(descPatch, "type_bien") as (typeof TYPES_BIEN)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, type_bien: v }))} options={TYPES_BIEN} />
                      {immeuble && (
                        <NumberField label="Nombre de lots" value={value(descPatch, "nb_lots")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_lots: v }))} hint={<span className="text-xs font-normal text-ink-400">logements de l&apos;immeuble</span>} />
                      )}
                      <NumberField label={immeuble ? "Surface totale" : "Surface"} value={value(descPatch, "surface_m2")} onChange={(v) => setDescPatch((p) => ({ ...p, surface_m2: v }))} suffix="m²" />
                      <NumberField label="Nb pièces" value={value(descPatch, "nb_pieces")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_pieces: v }))} />
                      <NumberField label="Nb chambres" value={value(descPatch, "nb_chambres")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_chambres: v }))} />
                      <TextField label="Étage" value={value(descPatch, "etage")} onChange={(v) => setDescPatch((p) => ({ ...p, etage: v }))} />
                      <BooleanField label="Ascenseur" value={value(descPatch, "ascenseur")} onChange={(v) => setDescPatch((p) => ({ ...p, ascenseur: v }))} />
                      <NumberField label="Année de construction" value={value(descPatch, "annee_construction")} onChange={(v) => setDescPatch((p) => ({ ...p, annee_construction: v }))} />
                      <SelectField label="État du bien" value={value(descPatch, "etat_bien") as (typeof ETATS_BIEN)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, etat_bien: v }))} options={ETATS_BIEN} />
                      <SelectField label="DPE" value={value(descPatch, "dpe") as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, dpe: v }))} options={DPE_GES_VALEURS} />
                      <SelectField label="GES" value={value(descPatch, "ges") as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, ges: v }))} options={DPE_GES_VALEURS} />
                      <TextField label="Photo (URL)" value={value(descPatch, "photo_url")} onChange={(v) => setDescPatch((p) => ({ ...p, photo_url: v }))} />
                    </div>
                    <TextAreaField
                      label="Description"
                      value={value(descPatch, "description")}
                      onChange={(v) => setDescPatch((p) => ({ ...p, description: v }))}
                      rows={16}
                    />
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <ReadOnlyField label="Ville" value={apt.ville || "—"} />
                      <ReadOnlyField label="Quartier" value={apt.quartier || "—"} />
                      <ReadOnlyField label="Adresse" value={apt.adresse || "—"} />
                      <ReadOnlyField label="Type de bien" value={apt.type_bien || "—"} />
                      {immeuble && (
                        <ReadOnlyField label="Nombre de lots" value={apt.nb_lots != null ? `${apt.nb_lots} logements` : "—"} />
                      )}
                      <ReadOnlyField label={immeuble ? "Surface totale" : "Surface"} value={apt.surface_m2 != null ? `${apt.surface_m2} m²` : "—"} />
                      <ReadOnlyField label="Nb pièces" value={apt.nb_pieces != null ? String(apt.nb_pieces) : "—"} />
                      <ReadOnlyField label="Nb chambres" value={apt.nb_chambres != null ? String(apt.nb_chambres) : "—"} />
                      <ReadOnlyField label="Étage" value={apt.etage || "—"} />
                      <ReadOnlyField label="Ascenseur" value={apt.ascenseur == null ? "—" : apt.ascenseur ? "Oui" : "Non"} />
                      <ReadOnlyField label="Année de construction" value={apt.annee_construction != null ? String(apt.annee_construction) : "—"} />
                      <ReadOnlyField label="État du bien" value={apt.etat_bien || "—"} />
                      <ReadOnlyField label="DPE" value={apt.dpe || "—"} />
                      <ReadOnlyField label="GES" value={apt.ges || "—"} />
                    </div>
                    <ReadOnlyField label="Description" value={apt.description || "—"} />
                  </>
                )}
          </section>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><ClipboardList className="h-3.5 w-3.5" /></span>
              Suivi
            </h2>
            <div className="space-y-4">
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Statut</span>
                <select
                  value={apt.statut}
                  onChange={(e) => patchNow({ statut: e.target.value as Statut })}
                  className={`w-full rounded-full border-0 px-3 py-1.5 text-sm font-medium ${
                    STATUT_STYLES[apt.statut] ?? "bg-ink-100 text-ink-600"
                  }`}
                >
                  {STATUTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-ink-700">Coup de cœur</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() =>
                        patchNow({ score_coup_de_coeur: apt.score_coup_de_coeur === n ? null : n })
                      }
                      className="text-amber-400 transition hover:scale-110"
                      aria-label={`${n} étoile(s)`}
                    >
                      <Star
                        className="h-6 w-6"
                        fill={apt.score_coup_de_coeur != null && n <= apt.score_coup_de_coeur ? "currentColor" : "none"}
                      />
                    </button>
                  ))}
                </div>
              </div>
              <TextAreaField
                label="Notes libres"
                value={notesLocal}
                onChange={setNotesLocal}
                onBlur={commitNotes}
                rows={3}
              />
            </div>
          </div>

          <div className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <span className="inline-flex rounded-lg bg-accent-50 p-1.5 text-accent-400"><User className="h-3.5 w-3.5" /></span>
              Contact
            </h2>
            <div className="space-y-3">
              <TextField
                label="Nom"
                value={contactNom}
                onChange={setContactNom}
                onBlur={() => commitContact("contact_nom", contactNom)}
              />
              <TextField
                label={
                  <span className="flex flex-1 items-center justify-between">
                    <span>Téléphone</span>
                    {apt.contact_telephone && (
                      <a
                        href={`tel:${apt.contact_telephone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1 text-xs font-normal text-accent-600 hover:text-accent-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Phone className="h-3 w-3" /> Appeler
                      </a>
                    )}
                  </span>
                }
                value={contactTel}
                onChange={setContactTel}
                onBlur={() => commitContact("contact_telephone", contactTel)}
              />
              <TextField
                label={
                  <span className="flex flex-1 items-center justify-between">
                    <span>Email</span>
                    {apt.contact_email && (
                      <a
                        href={`mailto:${apt.contact_email}`}
                        className="inline-flex items-center gap-1 text-xs font-normal text-accent-600 hover:text-accent-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Mail className="h-3 w-3" /> Écrire
                      </a>
                    )}
                  </span>
                }
                value={contactEmail}
                onChange={setContactEmail}
                onBlur={() => commitContact("contact_email", contactEmail)}
              />
            </div>
          </div>
        </aside>
      </div>
      )}
    </div>
    {deleteDialog}
    </>
  );
}

/** Libellé d'un champ en cours de recalcul : titre + mini-indicateur animé. */
const BANNER_STYLES: Record<BannerPhase, { bg: string; border: string; text: string; bar: string }> = {
  saving: { bg: "bg-accent-50/80", border: "border-accent-200", text: "text-accent-800", bar: "bg-accent-600" },
  success: { bg: "bg-emerald-50/80", border: "border-emerald-200", text: "text-emerald-800", bar: "bg-emerald-500" },
  error: { bg: "bg-red-50/80", border: "border-red-200", text: "text-red-800", bar: "bg-red-500" },
};

const BANNER_ICON: Record<BannerPhase, typeof Loader2> = {
  saving: Loader2,
  success: CheckCircle2,
  error: XCircle,
};

function StickyBanner({ phase, label }: BannerState) {
  const s = BANNER_STYLES[phase];
  const Icon = BANNER_ICON[phase];
  return (
    <div className={`sticky top-[67px] z-30 animate-banner-in border-b backdrop-blur ${s.bg} ${s.border}`}>
      <div className={`mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-3 text-xs font-medium sm:px-6 ${s.text}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${phase === "saving" ? "animate-spin" : ""}`} />
        <span>{label}</span>
      </div>
      {phase === "saving" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-accent-100">
          <span className="progress-indeterminate block h-full w-full bg-accent-600" />
        </div>
      )}
    </div>
  );
}

function PendingFieldLabel({ label }: { label: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-ink-700">
      {label}
      <span className="inline-flex items-center gap-1 text-[11px] font-normal text-accent-600">
        <Loader2 className="h-3 w-3 animate-spin" /> estimation en cours
      </span>
    </span>
  );
}

function ReadOnlyField({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="flex items-center gap-2 font-medium text-ink-700">
        {label}
        {badge}
      </span>
      <div className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-ink-500">
        {value}
      </div>
    </div>
  );
}

function SyntheseSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero verdict — même structure que SyntheseView */}
      <section className="rounded-xl border border-ink-200 bg-white p-6 sm:p-8">
        <div className="flex items-center justify-between gap-6">
          <div className="flex-1 space-y-3">
            <Skeleton className="h-3 w-48 rounded" />
            <Skeleton className="h-9 w-64 rounded" />
            <Skeleton className="h-4 w-80 max-w-full rounded" />
          </div>
          <Skeleton className="h-16 w-20 shrink-0 rounded-lg" />
        </div>
      </section>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-14 rounded-xl" />
    </div>
  );
}

function AnalyseIASkeleton() {
  return (
    <div className="space-y-6">
      {/* Score global — même structure que le vrai composant */}
      <section className="overflow-hidden rounded-xl border border-ink-200 bg-white">
        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-5 w-72 max-w-full" />
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-ink-100 px-6 py-3">
          <Skeleton className="h-6 w-28 rounded-full" />
          <Skeleton className="h-6 w-36 rounded-full" />
        </div>
        <div className="space-y-1.5 border-t border-ink-100 px-6 py-4">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-11/12" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
      </section>

      {/* Grille de blocs — 2 colonnes sur lg, 1 sur mobile */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Prix d'achat */}
        <SkeletonBloc faitCount={3} />
        {/* Potentiel locatif */}
        <SkeletonBloc faitCount={3} hasHighlights />
        {/* Simulation financière */}
        <SkeletonBloc faitCount={4} hasHighlights />
        {/* Potentiel */}
        <SkeletonBloc faitCount={3} />
        {/* Risques */}
        <SkeletonBloc faitCount={4} hasDpeGes />
        {/* Quartier */}
        <SkeletonBloc faitCount={0} isQuartier />
      </div>
    </div>
  );
}

function SkeletonBloc({
  faitCount,
  hasHighlights,
  hasDpeGes,
  isQuartier,
}: {
  faitCount: number;
  hasHighlights?: boolean;
  hasDpeGes?: boolean;
  isQuartier?: boolean;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-ink-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded-lg" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        {isQuartier ? (
          <Skeleton className="h-7 w-20 rounded-full" />
        ) : (
          <Skeleton className="h-7 w-16 rounded-full" />
        )}
      </div>
      <div className="mt-4 space-y-4">
        {isQuartier ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-4/5" />
          </div>
        ) : (
          <div className="space-y-1.5 rounded-lg bg-ink-50 px-3 py-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
        )}
        {hasDpeGes && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Skeleton className="mb-1 h-2.5 w-20" />
              <div className="flex gap-0.5">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skeleton key={i} className="h-7 flex-1 first:rounded-l last:rounded-r" />
                ))}
              </div>
            </div>
            <div>
              <Skeleton className="mb-1 h-2.5 w-16" />
              <div className="flex gap-0.5">
                {Array.from({ length: 7 }, (_, i) => (
                  <Skeleton key={i} className="h-7 flex-1 first:rounded-l last:rounded-r" />
                ))}
              </div>
            </div>
          </div>
        )}
        {hasHighlights && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-ink-50 p-4 space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
            <div className="rounded-lg bg-ink-50 p-4 space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-7 w-16" />
            </div>
          </div>
        )}
        {faitCount > 0 && (
          <ul className="divide-y divide-ink-100">
            {Array.from({ length: faitCount }, (_, j) => (
              <li key={j} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Skeleton className="h-1.5 w-1.5 shrink-0 rounded-full" />
                  <Skeleton className="h-3.5 w-36 max-w-[60%]" />
                </div>
                <Skeleton className="h-4 w-16" />
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-ink-100 pt-3">
          <Skeleton className="h-2.5 w-32" />
        </div>
      </div>
    </section>
  );
}

/**
 * Affiche la miniature plutôt que l'URL brute : en mode lecture, une longue
 * URL wrappée sur 2 lignes déséquilibrait la grille (la cellule voisine du
 * même rang reste courte), et une image est de toute façon plus utile à lire
 * qu'un chemin de fichier.
 */
function renderBoldInline(text: string) {
  return text.split(/(↑[^↓.]*|↓[^↑.]*|\d[\d\s]*€[^\s]*|\d+,?\d*\s*€|\d+[\s,.]?\d*\s*%|fourchette\s+haute|fourchette\s+basse|au-dessus|en-dessous|valorisation|luminosité|balcon|terrasse|rénov\w*|travaux|parking|cave|ascenseur|calme|vue|taux\s+communal|syndic|entretien|copropriété|exploitation|chauffage|ancien\w*)/gi).map((seg, i) => {
    if (i % 2 === 0) return seg;
    if (seg.startsWith("↑")) {
      return <span key={i} className="font-semibold text-emerald-700">{seg}</span>;
    }
    if (seg.startsWith("↓")) {
      return <span key={i} className="font-semibold text-amber-700">{seg}</span>;
    }
    return <strong key={i} className="font-semibold text-ink-900">{seg}</strong>;
  });
}

