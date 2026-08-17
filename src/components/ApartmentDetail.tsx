"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Calculator, HandCoins, Check, CheckCircle2, ExternalLink, Home, Loader2, Mail, MapPin, Pencil, Phone, RotateCcw, SlidersHorizontal, Trash2, Sparkles, Star, X, XCircle } from "lucide-react";
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
import { computeDerived, recalcLoyerCC, deriveLoyerHC } from "@/lib/calculations";
import {
  estimateAssurance,
  estimateChargesCopro,
  estimateFraisNotaire,
  estimateTaxeFonciere,
  isAiEstimated,
  TF_JUSTIF_COMMUNE_PREFIX,
} from "@/lib/estimates";
import { formatAdressePostale, lienGoogleMaps } from "@/lib/adresse";
import { formatApartmentTitle, formatDate, formatEuros, formatNote, sanitizeJustification } from "@/lib/format";
import { redirectionQuota } from "@/lib/quota";
import { computeRecalcNeeds, etapesRecalc } from "@/lib/recalc";
import { ANALYSE_VERSION, empreinteBien } from "@/lib/analyse/types";
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

const AnalyseIA = dynamic(() => import("@/components/AnalyseIA"), { ssr: false });
const OptimiserView = dynamic(() => import("@/components/OptimiserView"), { ssr: false });
const SimulationFinanciere = dynamic(() => import("@/components/SimulationFinanciere"), { ssr: false });
const FinancementSection = dynamic(() => import("@/components/FinancementSection"), { ssr: false });
const PlaygroundView = dynamic(() => import("@/components/PlaygroundView"), { ssr: false });
import { DECISION_CHIP, cashflowSeuilsFromSettings, seuilsRendementFromSettings } from "@/lib/analyse/scoring";
import { computeDecision, ecartPrixMarche } from "@/lib/analyse/decision";
import { renderBoldInline, renderMarkdownBold } from "@/components/richText";
import { facteursBaremeEffectifs, phraseSyntheseLoyer } from "@/lib/loyerSynthese";
import { SectionHeader, TabHeader } from "@/components/SectionHeader";
import { memeProfil, type AppSettings } from "@/lib/settings";
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
      {/* `flex-wrap` + valeur insécable : les deux boutons font ~180 px, la
          valeur suffixée ~140 px — sur mobile ça dépassait, et c'est le SUFFIXE
          qui se coupait (« 1 741 €/mois » puis « CC » seul à la ligne). Les
          boutons passent désormais à la ligne d'un bloc, le montant reste
          entier. */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="whitespace-nowrap font-mono text-2xl font-semibold tabular-nums text-ink-800">
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
        className="mb-[3px] shrink-0 rounded-md p-2 text-ink-400 transition-colors hover:text-ink-500"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

type Tab = "ia" | "donnees" | "financiere" | "simulation" | "playground";

const TABS: { key: Tab; label: string; shortLabel: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }[] = [
  { key: "ia", label: "Analyse", shortLabel: "Analyse", icon: Sparkles },
  { key: "playground", label: "Optimiser", shortLabel: "Optim.", icon: SlidersHorizontal },
  { key: "donnees", label: "Description du bien", shortLabel: "Bien", icon: Home },
  { key: "financiere", label: "Détails de l'opération", shortLabel: "Opération", icon: HandCoins },
  { key: "simulation", label: "Simulation financière", shortLabel: "Simulation", icon: Calculator },
];

type OptimiserSub = "playground" | "recommandations";

// Enregistrer une modification de la description ou de la section Achat déclenche
// un recalcul EN ARRIÈRE-PLAN (non bloquant) : loyer, charges et Analyse IA sont
// rejoués côté serveur pendant que l'utilisateur garde la main, avec un skeleton
// sur les seules données qui se rafraîchissent. La chaîne elle-même vit dans
// `/api/apartments/[id]/recalc` ; ici on n'allume que les skeletons, à partir de
// la MÊME table de champs (`computeRecalcNeeds`, `lib/recalc.ts`). Les retouches
// manuelles de Location/Charges (barre "Enregistrer" via finPatch) restent hors
// de ce flux.

/** « loyer, charges et analyse IA » — énumération à la française. */
function enumerer(mots: string[]): string {
  return mots.join(", ").replace(/, ([^,]+)$/, " et $1");
}

type BannerPhase = "saving" | "success" | "error" | "outdated";
interface BannerState {
  phase: BannerPhase;
  label: string;
  action?: { label: string; onClick: () => void };
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
  "à visiter": "bg-accent-50 text-accent-700",
  visité: "bg-accent-100 text-accent-800",
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
  const cashflowSeuils = cashflowSeuilsFromSettings(settings);
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
  const resolvedSpTab = spTab === "synthese" ? ("ia" as Tab) : spTab === "optimiser" ? ("playground" as Tab) : TABS.some((t) => t.key === spTab) ? (spTab as Tab) : null;

  const resolvedInitialTab = TABS.some((t) => t.key === initialTab) ? (initialTab as Tab) : "ia";
  const [activeTab, setActiveTab] = useState<Tab>(resolvedSpTab ?? resolvedInitialTab);
  const [editingDesc, setEditingDesc] = useState((resolvedSpTab ?? resolvedInitialTab) === "donnees" && (spEdit || !!initialEdit));
  const [optimiserSub, setOptimiserSub] = useState<OptimiserSub>("playground");

  const heroRef = useRef<HTMLDivElement>(null);

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
    // `setActiveTab`/`setPendingScroll` sont des setters `useState`, donc
    // stables — ils ne figurent ici que pour que les dépendances déclarées
    // couvrent celles inférées par le React Compiler (règle
    // `preserve-manual-memoization`), qui refusait sinon d'optimiser tout le
    // composant. Aucun effet à l'exécution.
    [router, apt.id, setActiveTab, setPendingScroll]
  );

  // L'URL (`?tab=…&edit=1`) pilote l'onglet : un lien externe ou un retour
  // navigateur doit l'imposer, sans écraser une navigation par onglet faite
  // ensuite à la main.
  //
  // Ajustement PENDANT LE RENDU plutôt que dans un effet — le motif que React
  // recommande pour « synchroniser un état sur un changement de prop » : un
  // effet aurait affiché l'ancien onglet pendant une frame avant de basculer.
  // La garde `!==` est ce qui empêche la boucle : le second rendu ne change
  // plus rien.
  const [tabDepuisUrl, setTabDepuisUrl] = useState(resolvedSpTab);
  if (resolvedSpTab && resolvedSpTab !== tabDepuisUrl) {
    setTabDepuisUrl(resolvedSpTab);
    setActiveTab(resolvedSpTab);
    if (resolvedSpTab === "donnees" && spEdit) setEditingDesc(true);
  }

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
    if (key === "charges_copro_annuelles" && apt.loyer_retenu != null && !apt.champs_manuels.includes("loyer_retenu")) {
      const newCharges = (finPatch as Record<string, unknown>)[key] as number | null;
      if (newCharges != null) {
        const hc = apt.loyer_hc ?? deriveLoyerHC(apt.loyer_retenu, apt.charges_copro_annuelles ?? 0);
        (fieldPatch as Record<string, unknown>).loyer_retenu = recalcLoyerCC(hc, newCharges);
        if (apt.loyer_hc == null) (fieldPatch as Record<string, unknown>).loyer_hc = hc;
        (fieldPatch as Record<string, unknown>).champs_manuels = Array.from(new Set([...apt.champs_manuels, "charges_copro_annuelles" as const]));
      }
    }
    save(fieldPatch, () => {
      setFinPatch((p) => { const { [key]: _, ...rest } = p as Record<string, unknown>; return rest; });
      setEditingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
    });
  }

  function cancelField(key: string) {
    setEditingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
    setFinPatch((p) => { const { [key]: _, ...rest } = p as Record<string, unknown>; return rest; });
  }

  const CHAMPS_ESTIMABLES_UI = {
    loyer_retenu: { label: "loyer", url: "/api/estimate-rent" },
    charges_copro_annuelles: { label: "charges copro", url: "/api/estimate-charges" },
    taxe_fonciere: { label: "taxe foncière", url: "/api/estimate-charges" },
    assurance_annuelle: { label: "assurance", url: "/api/estimate-assurance" },
  } as const;

  function estimateFieldAI(key: keyof typeof CHAMPS_ESTIMABLES_UI) {
    setEstimatingFields((prev) => new Set(prev).add(key));

    const { label, url } = CHAMPS_ESTIMABLES_UI[key];
    // Le champ n'est passé qu'aux charges : les deux autres routes n'estiment
    // qu'un seul champ, et un `field` inutile y serait ignoré en silence.
    const body: Record<string, string> = { apartmentId: apt.id };
    if (url === "/api/estimate-charges") body.field = key;
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
          const updated = (await res.json()).apartment;
          setApt(updated);
          ok = true;
          if (key === "charges_copro_annuelles" && updated.loyer_retenu != null && !updated.champs_manuels.includes("loyer_retenu") && updated.charges_copro_annuelles != null) {
            const hc = updated.loyer_hc ?? deriveLoyerHC(updated.loyer_retenu, apt.charges_copro_annuelles ?? 0);
            const newLoyer = recalcLoyerCC(hc, updated.charges_copro_annuelles);
            if (newLoyer !== updated.loyer_retenu) {
              const loyerPatch: Record<string, unknown> = { loyer_retenu: newLoyer, champs_manuels: updated.champs_manuels };
              if (updated.loyer_hc == null) loyerPatch.loyer_hc = hc;
              try {
                const r = await fetch(`/api/apartments/${apt.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(loyerPatch),
                });
                if (r.ok) setApt((await r.json()).apartment);
              } catch {}
            }
          }
        }
      } catch {}
      setEstimatingFields((prev) => { const next = new Set(prev); next.delete(key); return next; });
      // Formulation invariable en genre : « Assurance recalculé » sortait d'un
      // accord fait sur un libellé masculin par défaut.
      resolveBanner(ok, ok ? `Estimation ${label} mise à jour` : `Échec de l'estimation ${label} — réessayez`);
    })();
  }

  /**
   * Enregistre le patch et rejoue la chaîne impactée — UN seul aller-retour.
   *
   * Le serveur enchaîne charges → loyer → assurance → analyse (voir
   * `/api/apartments/[id]/recalc`). Les étapes sont nommées ici pour la
   * bannière, à partir de la même table de champs que celle qu'il applique :
   * annoncer une étape que le serveur ne joue pas (ou l'inverse) supposerait
   * deux listes à tenir synchronisées, ce qui était exactement le montage
   * précédent.
   */
  async function runRecalc(patch: ApartmentPatch) {
    const needs = computeRecalcNeeds(patch);
    setRentPending(needs.rent);
    setChargesPending(needs.charges);
    setAnalysisPending(needs.analysis);

    const etapes = etapesRecalc(needs);
    showBanner(
      etapes.length > 0
        ? `Enregistrement, puis recalcul — ${enumerer(etapes)}…`
        : "Enregistrement des modifications…"
    );

    let ok = false;
    try {
      const res = await fetch(`/api/apartments/${apt.id}/recalc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (res.ok) {
        setApt(data.apartment);
        ok = true;
      } else {
        // Quota d'analyses atteint : rien n'a été écrit (le quota est vérifié
        // en tête de chaîne). L'écran dédié explique la limite, là où un
        // bandeau rouge laisserait croire à un échec technique.
        const versUpgrade = redirectionQuota(res, data);
        if (versUpgrade) {
          setRentPending(false);
          setChargesPending(false);
          setAnalysisPending(false);
          router.push(versUpgrade);
          return;
        }
      }
    } catch {}

    setRentPending(false);
    setChargesPending(false);
    setAnalysisPending(false);

    resolveBanner(
      ok,
      ok
        ? etapes.length > 0
          ? `Tout est à jour — ${enumerer(etapes)} recalculé${etapes.length > 1 ? "s" : ""}`
          : "Modifications enregistrées"
        : "La mise à jour a échoué — réessayez"
    );
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
        const data = await res.json();
        if (res.ok) {
          setApt(data.apartment);
          onSuccess?.(data);
          ok = true;
        } else {
          const versUpgrade = redirectionQuota(res, data);
          if (versUpgrade) {
            setPending(false);
            router.push(versUpgrade);
            return;
          }
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
  // Adresse la plus complète dont on dispose — « 12 rue des Lilas, 75020 Paris ».
  // L'ancien `apt.adresse || "quartier, ville"` faisait disparaître la ville dès
  // qu'une rue était renseignée : le `||` emportait le repli en entier.
  const localisation = formatAdressePostale(apt);
  const hasCoords = Number.isFinite(apt.latitude) && Number.isFinite(apt.longitude);
  const urlMaps = lienGoogleMaps(apt, apt.latitude, apt.longitude);
  // ⚠️ `!== "exacte"`, jamais `=== "arrondissement"` : depuis l'ajout du niveau
  // `rue`, une égalité stricte sur `arrondissement` laisse passer les positions
  // au milieu d'une voie comme si elles désignaient le bâtiment.
  const localisationApproximative = apt.precision_localisation !== "exacte";

  // Pastille de décision de l'en-tête. Dérivée par `computeDecision`, la source
  // UNIQUE du verdict — jamais recalculée à la main ici (cf. AGENTS.md). Tous
  // les accès sont gardés : une analyse stockée dans un schéma antérieur peut
  // n'avoir ni `blocs` ni `verdicts`, que le type promet pourtant obligatoires.
  const scoreGlobal = apt.analyse_ia?.score_global ?? null;
  const decisionEntete =
    scoreGlobal == null
      ? null
      : computeDecision(
          scoreGlobal,
          apt.analyse_ia?.verdicts ?? [],
          ecartPrixMarche(apt.analyse_ia?.blocs?.prix)
        );

  // Sous-titres des onglets. Les trois onglets de données décrivent ce qu'ils
  // montrent (texte fixe) ; Analyse et Optimiser décrivent leur ÉTAT, seule
  // information que l'utilisateur ne peut pas déduire de l'onglet lui-même.
  // Tous les accès à `analyse_ia` sont gardés : une analyse stockée dans un
  // schéma antérieur n'a pas forcément les champs que le type promet.
  const sousTitreAnalyse = apt.analyse_ia?.genere_le
    ? `Verdict d'achat, sous-scores et faits chiffrés · analysée le ${formatDate(apt.analyse_ia.genere_le)}`
    : "Pas encore analysée — le verdict et les sous-scores apparaîtront ici.";

  // ⚠️ Ne JAMAIS promettre un « Achète » que le moteur n'a pas trouvé : les
  // recommandations portent `flipVersAchat`, on lit ce drapeau au lieu de
  // supposer. Un bien déjà « Achète » n'a rien à faire basculer — ses leviers
  // servent à gagner en rentabilité, pas à changer la décision.
  const recosOptimiser = apt.analyse_ia?.recommandations ?? null;
  const flipsOptimiser = recosOptimiser?.filter((r) => r.flipVersAchat).length ?? 0;
  const sousTitreOptimiser =
    recosOptimiser == null || recosOptimiser.length === 0
      ? "Les leviers chiffrés qui amélioreraient la rentabilité de ce bien."
      : decisionEntete === "achete"
        ? "Ce bien est déjà un achat — voici comment en améliorer la rentabilité."
        : flipsOptimiser > 0
          ? `${flipsOptimiser} levier${flipsOptimiser > 1 ? "s" : ""} ${flipsOptimiser > 1 ? "font" : "fait"} basculer ce bien en « Achète ».`
          : "Aucun levier ne fait basculer la décision — voici ce qui améliore quand même la rentabilité.";

  // Une analyse stockée est périmée pour DEUX raisons distinctes, et le message
  // doit dire laquelle : le code a changé (nouveaux blocs, nouveau scoring), ou
  // le Profil investisseur a changé depuis le calcul. Le second cas passait
  // totalement inaperçu jusqu'ici — modifier un seuil ou son taux de crédit
  // laissait chaque bien afficher un score calculé sur les anciens réglages.
  // `settings` est absent des analyses < v5 : dans ce cas la comparaison est
  // inutile, le test de version suffit déjà à les marquer obsolètes.
  const profilChange =
    apt.analyse_ia?.settings != null && !memeProfil(apt.analyse_ia.settings, settings);
  // Données du bien modifiées depuis le calcul. Nécessaire EN PLUS de
  // `ANALYSIS_FIELDS` (qui déclenche un recalcul auto) : sept champs nourrissent
  // le score sans y figurer — loyer, charges, taxe foncière, assurance, gestion,
  // quote-part terrain, hypothèses de crédit — et surtout ils passent par
  // `saveField` / `SimulationFinanciere`, deux chemins qui ne consultent jamais
  // cette liste. Allonger `ANALYSIS_FIELDS` n'aurait donc rien changé.
  const donneesChangees =
    apt.analyse_ia?.empreinteBien != null &&
    empreinteBien(apt) !== apt.analyse_ia.empreinteBien;
  const analyseOutdated =
    apt.analyse_ia != null &&
    (apt.analyse_ia.version < ANALYSE_VERSION || donneesChangees || profilChange);

  // Un seul bandeau, mais le motif doit être NOMMÉ — « relance » sans dire
  // pourquoi n'aide pas à décider. Ordre : la version prime (elle invalide tout),
  // puis les données du bien (le geste le plus fréquent), puis le profil.
  const motifObsolete = !analyseOutdated
    ? null
    : apt.analyse_ia!.version < ANALYSE_VERSION
      ? "L'algorithme d'analyse a évolué — relance pour des résultats à jour"
      : donneesChangees
        ? "Les données du bien ont changé — relance pour des résultats à jour"
        : "Ton profil investisseur a changé — relance pour des résultats à jour";

  return (
    <>
    {/* ── Hero scroll-away : retour + photo | titre/meta, score en dessous ── */}
    <div ref={heroRef} className="bg-white">
      <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition-colors hover:text-ink-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la liste
        </Link>

        <div className="mt-5 flex items-start gap-5 pb-5">
          {apt.photo_url ? (
            <a
              href={apt.url || "#"}
              target="_blank"
              rel="noreferrer"
              aria-label={apt.url ? `Voir l'annonce sur ${apt.plateforme}` : "Photo du bien"}
              className="block aspect-video w-44 shrink-0 overflow-hidden rounded-lg ring-1 ring-ink-200 transition-shadow hover:ring-2 hover:ring-accent-400"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
            </a>
          ) : (
            <div className="flex aspect-video w-44 shrink-0 items-center justify-center rounded-lg bg-ink-50 ring-1 ring-ink-200">
              <Home className="h-5 w-5 text-ink-300" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <h1 className="truncate text-lg font-semibold text-ink-900 sm:text-xl">
                {formatApartmentTitle(apt)}
              </h1>
              {apt.prix != null && (
                <>
                  <span className="text-lg font-semibold text-ink-900 sm:text-xl">·</span>
                  <span className="shrink-0 text-lg font-semibold text-ink-900 sm:text-xl">
                    {formatEuros(apt.prix)}
                  </span>
                </>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-400">
              {localisation && <span className="truncate">{localisation}</span>}
              {apt.adresse && apt.quartier && (
                <>
                  <span>·</span>
                  <span className="font-medium text-ink-500">{apt.quartier}</span>
                </>
              )}
              <span>·</span>
              <span>{apt.plateforme}</span>
              {apt.url && (
                <>
                  <span>·</span>
                  <a
                    href={apt.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-accent-600 hover:text-accent-800"
                  >
                    Annonce <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
              {urlMaps && (
                <>
                  <span className="sm:hidden">·</span>
                  <a
                    href={urlMaps}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-accent-600 hover:text-accent-800 sm:hidden"
                  >
                    Carte <MapPin className="h-3 w-3" />
                  </a>
                </>
              )}
              <span>·</span>
              <button
                type="button"
                onClick={(e) => requestDelete(e, apt)}
                className="-m-1.5 rounded p-1.5 text-ink-300 transition-colors hover:text-red-500"
                aria-label="Supprimer ce bien"
                title="Supprimer ce bien"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {scoreGlobal != null && decisionEntete && (
              <span
                className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${DECISION_CHIP[decisionEntete].className}`}
              >
                {DECISION_CHIP[decisionEntete].label}
                <b className="font-mono font-semibold">{formatNote(scoreGlobal)}</b>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* ── Sticky bar : identité (quand hero scrollé) + onglets ── */}
    <div className="sticky top-0 z-40 border-b border-ink-100/70 bg-white">
      <nav className="no-scrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={`/appartements/${apt.id}?tab=${tab.key}`}
            onClick={(e) => {
              e.preventDefault();
              setActiveTab(tab.key);
              router.push(`/appartements/${apt.id}?tab=${tab.key}`, { scroll: false });
              const hero = heroRef.current;
              if (hero) {
                const heroBottom = hero.getBoundingClientRect().bottom;
                if (heroBottom < 0) {
                  window.scrollTo({ top: hero.offsetTop + hero.offsetHeight, behavior: "instant" });
                }
              }
            }}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition ${
              activeTab === tab.key
                ? "border-accent-600 text-accent-600"
                : "border-transparent text-ink-500 hover:text-ink-700"
            }`}
          >
            <span className="sm:hidden">{tab.shortLabel}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        ))}
      </nav>
    </div>

    {banner ? (
      <StickyBanner phase={banner.phase} label={banner.label} />
    ) : motifObsolete ? (
      <StickyBanner
        phase="outdated"
        label={motifObsolete}
        action={{ label: "Mettre à jour", onClick: handleRelancerAnalyse }}
      />
    ) : null}

    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">

      {activeTab === "ia" && (
        <>
          <TabHeader title="Analyse" subtitle={sousTitreAnalyse} />
          {analysisPending ? (
            <AnalyseIASkeleton />
          ) : (
            <AnalyseIA apartment={apt} settings={settings} seuilsRendement={seuilsRendement} cashflowSeuils={cashflowSeuils} onAnalysed={setApt} onRelancer={handleRelancerAnalyse} onGoTab={goToSection} quotaNotice={quotaNotice} />
          )}
        </>
      )}

      {activeTab === "financiere" && (
        <>
          <TabHeader
            title="Détails de l'opération"
            subtitle="Ce que coûte l'achat, ce que rapporte la location."
          />
          <div className="space-y-6">
          {/* Résultat principal : la rentabilité au premier coup d'œil */}
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

          <section id="fin-achat" className="space-y-4 scroll-mt-24 rounded-xl border border-ink-100 bg-white p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <SectionHeader title="Achat" />
                  {editingAchat ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={handleCancelAchat}
                        className="rounded-lg border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={handleSaveAchat}
                        className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
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
                  <div className="space-y-3">
                    <ul className="divide-y divide-ink-100/50 text-sm">
                      <AchatEditRow label="Prix d'achat" value={value(achatPatch, "prix")} onChange={(v) => setAchatPatch((p) => ({ ...p, prix: v }))} badge={<span className="text-red-500" title="Obligatoire">*</span>} />
                      <AchatEditRow
                        label="Frais de notaire"
                        value={fraisNotaireLive}
                        onChange={(v) => setAchatPatch((p) => ({ ...p, frais_notaire_estimes: v }))}
                        badge={!fraisNotaireManuel && fraisNotaireLive != null && <EstimatedBadge />}
                      />
                      <AchatEditRow label="Travaux" value={value(achatPatch, "travaux")} onChange={(v) => setAchatPatch((p) => ({ ...p, travaux: v }))} />
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="font-semibold text-ink-900">Budget total</span>
                        <span className="shrink-0 text-base font-bold tabular-nums text-ink-900">{formatEuros(live.budget_total)}</span>
                      </li>
                    </ul>
                    {live.prix_m2 != null && (
                      <p className="text-xs text-ink-400">
                        Prix au m² (achat + travaux) : <span className="tabular-nums font-medium text-ink-600">{formatEuros(live.prix_m2)}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <ul className="divide-y divide-ink-100/50 text-sm">
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="flex items-baseline gap-x-2 text-ink-600">
                          <span className="inline-block w-3 shrink-0 text-center font-semibold text-ink-400">+</span>
                          <span>Prix d&apos;achat</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-ink-800">{formatEuros(apt.prix)}</span>
                      </li>
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-ink-600">
                          <span className="inline-block w-3 shrink-0 text-center font-semibold text-ink-400">+</span>
                          <span>Frais de notaire</span>
                          {!fraisNotaireManuel && fraisNotaireLive != null && <span className="shrink-0 self-center"><EstimatedBadge /></span>}
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-ink-800">{fraisNotaireLive != null ? formatEuros(fraisNotaireLive) : "—"}</span>
                      </li>
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="flex items-baseline gap-x-2 text-ink-600">
                          <span className="inline-block w-3 shrink-0 text-center font-semibold text-ink-400">+</span>
                          <span>Travaux</span>
                        </span>
                        <span className="shrink-0 font-medium tabular-nums text-ink-800">{apt.travaux != null ? formatEuros(apt.travaux) : formatEuros(0)}</span>
                      </li>
                      <li className="flex items-baseline justify-between gap-3 py-2">
                        <span className="font-semibold text-ink-900">Budget total</span>
                        <span className="shrink-0 text-base font-bold tabular-nums text-ink-900">{formatEuros(live.budget_total)}</span>
                      </li>
                    </ul>
                    {live.prix_m2 != null && (
                      <p className="text-xs text-ink-400">
                        Prix au m² (achat + travaux) : <span className="tabular-nums font-medium text-ink-600">{formatEuros(live.prix_m2)}</span>
                      </p>
                    )}
                  </>
                )}
          </section>

          <FinancementSection
            apartment={live}
            settings={settings}
            onSaved={setApt}
          />

          <section className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
            <SectionHeader title="Revenus" />
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
                {!editingFields.has("loyer_retenu") && !("loyer_retenu" in finPatch) && (
                  // Même phrase de synthèse que l'Étape 2 du panneau de
                  // détail (`LoyerDetailPanel`, fonction PARTAGÉE
                  // `loyerSynthese.ts`) — les deux décrivaient auparavant le
                  // même calcul avec des textes différents. `anilMedian`
                  // omis volontairement : cette page ne fetch pas la
                  // référence ANIL côté client, seul le repli des calculs
                  // enregistrés avant `facteursDeterministes` (rare) en perd
                  // la clause "barème", jamais toute la phrase.
                  apt.loyer_calcul ? (
                    <p className="rounded-md bg-ink-50 p-3 text-xs text-ink-600 whitespace-pre-line">
                      {renderMarkdownBold(
                        phraseSyntheseLoyer(
                          facteursBaremeEffectifs(apt.loyer_calcul),
                          apt.loyer_calcul.criteres,
                          apt.loyer_calcul.echecIa
                        )
                      )}
                    </p>
                  ) : (
                    apt.loyer_justification && (
                      <p className="rounded-md bg-ink-50 p-3 text-xs text-ink-600 whitespace-pre-line">
                        {renderBoldInline(sanitizeJustification(apt.loyer_justification, apt.surface_m2, "€/mois", 6))}
                      </p>
                    )
                  )
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

          <section className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
            <SectionHeader title="Charges annuelles" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
            </div>
          </section>
          </div>
        </>
      )}

      {activeTab === "simulation" && (
        <>
          <TabHeader
            title="Simulation financière"
            subtitle="Crédit, fiscalité LMNP au réel et cash-flow année par année."
          />
          <SimulationFinanciere
            key={`sim-${apt.id}`}
            apartment={live}
            settings={settings}
            onSaved={setApt}
          />
        </>
      )}

      {activeTab === "donnees" && (
      <>
      {/* Le titre « Description du bien » vivait DANS la colonne principale,
          donc décalé sous la grille et absent au-dessus de la colonne latérale.
          Il est remonté en en-tête d'onglet, avec ses actions. */}
      <TabHeader
        title="Description du bien"
        subtitle="Les données extraites de l'annonce, corrigeables à la main."
      >
        {editingDesc ? (
          <>
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
          </>
        ) : (
          <button
            onClick={() => setEditingDesc(true)}
            className="rounded-md border border-ink-300 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
          >
            Modifier
          </button>
        )}
      </TabHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Colonne principale — quatre groupes de champs, un par carte, plus le
            texte de l'annonce en pleine largeur. Chaque carte porte SES DEUX
            modes côte à côte (lecture / édition) : c'est ce qui empêche un
            champ d'exister d'un côté seulement, comme l'a fait `code_postal`. */}
        <div className="min-w-0 space-y-3">
          <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
            <FieldCard title="Localisation">
              {editingDesc ? (
                <EditStack>
                  <TextField label="Ville" value={value(descPatch, "ville")} onChange={(v) => setDescPatch((p) => ({ ...p, ville: v }))} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <TextField label="Quartier" value={value(descPatch, "quartier")} onChange={(v) => setDescPatch((p) => ({ ...p, quartier: v }))} />
                  <TextField label="Code postal" value={value(descPatch, "code_postal")} onChange={(v) => setDescPatch((p) => ({ ...p, code_postal: v }))} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <TextField label="Adresse" value={value(descPatch, "adresse")} onChange={(v) => setDescPatch((p) => ({ ...p, adresse: v }))} />
                </EditStack>
              ) : (
                <ReadStack>
                  <FieldRow label="Ville" value={apt.ville} />
                  <FieldRow label="Quartier" value={apt.quartier} />
                  <FieldRow label="Code postal" value={apt.code_postal} mono />
                  <FieldRow label="Adresse" value={apt.adresse} />
                </ReadStack>
              )}
            </FieldCard>

            <FieldCard title="Caractéristiques">
              {editingDesc ? (
                <EditStack>
                  <SelectField label="Type de bien" value={value(descPatch, "type_bien") as (typeof TYPES_BIEN)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, type_bien: v }))} options={TYPES_BIEN} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  {immeuble && (
                    <NumberField label="Nombre de lots" value={value(descPatch, "nb_lots")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_lots: v }))} hint={<span className="text-xs font-normal text-ink-400">logements de l&apos;immeuble</span>} />
                  )}
                  <NumberField label={immeuble ? "Surface totale" : "Surface"} value={value(descPatch, "surface_m2")} onChange={(v) => setDescPatch((p) => ({ ...p, surface_m2: v }))} suffix="m²" hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <NumberField label="Nb pièces" value={value(descPatch, "nb_pieces")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_pieces: v }))} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <NumberField label="Nb chambres" value={value(descPatch, "nb_chambres")} onChange={(v) => setDescPatch((p) => ({ ...p, nb_chambres: v }))} />
                </EditStack>
              ) : (
                <ReadStack>
                  <FieldRow label="Type de bien" value={apt.type_bien} />
                  {immeuble && (
                    <FieldRow label="Nombre de lots" value={apt.nb_lots != null ? `${apt.nb_lots} logements` : ""} mono />
                  )}
                  <FieldRow label={immeuble ? "Surface totale" : "Surface"} value={apt.surface_m2 != null ? `${apt.surface_m2} m²` : ""} mono />
                  <FieldRow label="Nb pièces" value={apt.nb_pieces != null ? String(apt.nb_pieces) : ""} mono />
                  <FieldRow label="Nb chambres" value={apt.nb_chambres != null ? String(apt.nb_chambres) : ""} mono />
                </ReadStack>
              )}
            </FieldCard>

            <FieldCard title="Bâtiment">
              {editingDesc ? (
                <EditStack>
                  <TextField label="Étage" value={value(descPatch, "etage")} onChange={(v) => setDescPatch((p) => ({ ...p, etage: v }))} />
                  <BooleanField label="Ascenseur" value={value(descPatch, "ascenseur")} onChange={(v) => setDescPatch((p) => ({ ...p, ascenseur: v }))} />
                  <NumberField label="Année de construction" value={value(descPatch, "annee_construction")} onChange={(v) => setDescPatch((p) => ({ ...p, annee_construction: v }))} />
                </EditStack>
              ) : (
                <ReadStack>
                  <FieldRow label="Étage" value={apt.etage} mono />
                  <FieldRow label="Ascenseur" value={apt.ascenseur == null ? "" : apt.ascenseur ? "Oui" : "Non"} />
                  {/* Une année ne se groupe JAMAIS par milliers (cf. AGENTS.md)
                      — d'où `String()` et pas `formatNombre`. */}
                  <FieldRow label="Année de construction" value={apt.annee_construction != null ? String(apt.annee_construction) : ""} mono />
                </ReadStack>
              )}
            </FieldCard>

            <FieldCard title="État et diagnostics">
              {editingDesc ? (
                <EditStack>
                  <SelectField label="État du bien" value={value(descPatch, "etat_bien") as (typeof ETATS_BIEN)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, etat_bien: v }))} options={ETATS_BIEN} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <SelectField label="DPE" value={value(descPatch, "dpe") as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, dpe: v }))} options={DPE_GES_VALEURS} hint={<span className="text-red-500" title="Obligatoire">*</span>} />
                  <SelectField label="GES" value={value(descPatch, "ges") as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, ges: v }))} options={DPE_GES_VALEURS} />
                </EditStack>
              ) : (
                <ReadStack>
                  <FieldRow label="État du bien" value={apt.etat_bien} />
                  <FieldRow label="DPE" value={apt.dpe} />
                  <FieldRow label="GES" value={apt.ges} />
                </ReadStack>
              )}
            </FieldCard>
          </div>

          {hasCoords && (
            <div className="overflow-hidden rounded-xl border border-ink-100">
              <div className="h-48 sm:h-56">
                {urlMaps ? (
                  <a href={urlMaps} target="_blank" rel="noreferrer" aria-label="Voir sur Google Maps" className="block h-full">
                    <ApartmentLocationMap
                      key={`map-${apt.id}`}
                      latitude={apt.latitude!}
                      longitude={apt.longitude!}
                      approximatif={localisationApproximative}
                      compact
                    />
                  </a>
                ) : (
                  <ApartmentLocationMap
                    key={`map-${apt.id}`}
                    latitude={apt.latitude!}
                    longitude={apt.longitude!}
                    approximatif={localisationApproximative}
                    compact
                  />
                )}
              </div>
            </div>
          )}

          {/* Le contenu brut de l'annonce — pleine largeur, c'est du texte long
              et une URL, ni l'un ni l'autre ne tient dans une demi-colonne. */}
          <FieldCard title="Annonce">
            {editingDesc ? (
              <EditStack>
                <TextField label="Photo (URL)" value={value(descPatch, "photo_url")} onChange={(v) => setDescPatch((p) => ({ ...p, photo_url: v }))} />
                <TextAreaField
                  label="Description"
                  value={value(descPatch, "description")}
                  onChange={(v) => setDescPatch((p) => ({ ...p, description: v }))}
                  rows={14}
                />
              </EditStack>
            ) : (
              <ReadStack>
                <FieldRow
                  label="Photo"
                  value={
                    apt.photo_url ? (
                      <a
                        href={apt.photo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-600 underline underline-offset-2 hover:text-accent-800"
                      >
                        Ouvrir
                      </a>
                    ) : (
                      ""
                    )
                  }
                />
                <div className="py-2.5">
                  <p className="mb-1.5 text-sm text-ink-500">Description</p>
                  {/* `whitespace-pre-wrap` : le texte de l'annonce garde ses
                      sauts de ligne. Rendu VERBATIM — aucun formatage de
                      nombres, c'est la copie du vendeur (cf. AGENTS.md). */}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-800">
                    {apt.description || "—"}
                  </p>
                </div>
              </ReadStack>
            )}
          </FieldCard>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-ink-100 bg-white p-5">
            <SectionHeader title="Suivi" className="mb-4" />
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

          <div className="rounded-xl border border-ink-100 bg-white p-5">
            <SectionHeader title="Contact" className="mb-4" />
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
      </>
      )}

      {activeTab === "playground" && (
        // `space-y-8` : la bascule de sous-pill doit se détacher du contenu
        // qu'elle commande, sinon elle se lit comme une rangée de badges du
        // premier bloc.
        <div className="space-y-8">
          <TabHeader
            title="Optimiser"
            subtitle={optimiserSub === "playground"
              ? "Visualisez à quel prix ou loyer votre investissement s'améliore."
              : sousTitreOptimiser}
          />
          <div className="flex gap-2">
            {([
              { key: "playground" as const, label: "Playground" },
              { key: "recommandations" as const, label: "Recommandations" },
            ]).map((sub) => (
              <button
                key={sub.key}
                onClick={() => setOptimiserSub(sub.key)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                  optimiserSub === sub.key
                    ? "bg-accent-600 text-white"
                    : "border border-ink-200 bg-white text-ink-500 hover:text-ink-700 hover:border-ink-300"
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>
          {optimiserSub === "playground" && (
            <PlaygroundView apartment={live} settings={settings} />
          )}
          {optimiserSub === "recommandations" && (
            analysisPending ? (
              <OptimiserSkeleton />
            ) : (
              <OptimiserView
                apartment={apt}
                settings={settings}
                seuilsRendement={seuilsRendement}
                cashflowSeuils={cashflowSeuils}
                onRelancer={handleRelancerAnalyse}
              />
            )
          )}
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
  outdated: { bg: "bg-amber-50/80", border: "border-amber-200", text: "text-amber-800", bar: "bg-amber-500" },
};

const BANNER_ICON: Record<BannerPhase, typeof Loader2> = {
  saving: Loader2,
  success: CheckCircle2,
  error: XCircle,
  outdated: RotateCcw,
};

function StickyBanner({ phase, label, action }: BannerState) {
  const s = BANNER_STYLES[phase];
  const Icon = BANNER_ICON[phase];
  return (
    <div className={`sticky top-[55px] z-30 animate-banner-in border-b backdrop-blur ${s.bg} ${s.border}`}>
      <div className={`mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-3 text-xs font-medium sm:px-6 ${s.text}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${phase === "saving" ? "animate-spin" : ""}`} />
        <span className="flex-1">{label}</span>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-amber-700"
          >
            {action.label}
          </button>
        )}
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

function AchatEditRow({
  label,
  value,
  onChange,
  badge,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  badge?: React.ReactNode;
}) {
  const [texte, setTexte] = useState(value != null ? String(value) : "");
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setTexte(value != null ? String(value) : "");
  }
  function handle(t: string) {
    setTexte(t);
    if (t === "") { onChange(null); return; }
    const n = Number(t);
    if (!Number.isNaN(n)) onChange(n);
  }
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-ink-600">
        <span className="inline-block w-3 shrink-0 text-center font-semibold text-ink-400">+</span>
        <span>{label}</span>
        {badge && <span className="shrink-0">{badge}</span>}
      </span>
      <div className="relative w-36 shrink-0">
        <input
          type="number"
          className="w-full rounded-md border border-ink-300 bg-white px-3 py-1.5 pr-8 text-left text-sm text-ink-900 focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
          value={texte}
          onChange={(e) => handle(e.target.value)}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">€</span>
      </div>
    </li>
  );
}

/**
 * Carte d'un groupe de champs de l'onglet « Description du bien ».
 *
 * L'onglet reste une section SANS encadrement (cf. AGENTS.md, « Sections sans
 * card ») : ce sont les GROUPES à l'intérieur qui sont encadrés, ce que cette
 * même règle recommande explicitement. Les quinze champs vivaient auparavant
 * dans une seule grille à deux colonnes, sans aucun regroupement : « GES »
 * suivait « État du bien » qui suivait « Année de construction », et rien ne
 * disait qu'on avait changé de sujet trois fois.
 */
function FieldCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-ink-100 bg-white p-5">
      <SectionHeader title={title} className="mb-2" />
      {children}
    </section>
  );
}

/** Pile de lignes en LECTURE — séparateurs à l'opacité conventionnelle. */
function ReadStack({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-ink-100/50">{children}</div>;
}

/** Pile de champs en ÉDITION — une seule colonne, la carte est étroite. */
function EditStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4 pt-2">{children}</div>;
}

/**
 * Ligne « libellé … valeur » d'une carte de description.
 *
 * ⚠️ **Le badge se colle au LIBELLÉ, jamais à la valeur.** Un badge qualifie la
 * PROVENANCE du champ (détecté, estimé, saisi), pas le nombre affiché : posé à
 * droite il se lit comme une unité ou un commentaire du chiffre, et il pousse
 * la valeur hors de sa colonne, ce qui casse l'alignement d'une ligne à
 * l'autre. C'est déjà la convention de `DisplayValue` (onglet Opération) —
 * les deux ne doivent pas diverger.
 *
 * `value` vide rend « — » : un champ non renseigné se voit, il ne disparaît
 * pas. `mono` aligne les chiffres d'une ligne à l'autre (`font-mono`, comme
 * partout où l'app affiche un nombre).
 */
function FieldRow({
  label,
  value,
  badge,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  badge?: React.ReactNode;
  mono?: boolean;
}) {
  const vide = value == null || value === "";
  return (
    // `gap-4` + `min-w-0` sur le libellé : c'est LUI qui se tronque quand la
    // carte se resserre, jamais la valeur (cf. AGENTS.md, piège mobile n°4).
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="flex min-w-0 items-center gap-1.5 text-sm text-ink-500">
        <span className="truncate">{label}</span>
        {badge}
      </span>
      <span
        className={`shrink-0 text-sm font-semibold ${mono ? "font-mono " : ""}${
          vide ? "text-ink-300" : "text-ink-900"
        }`}
      >
        {vide ? "—" : value}
      </span>
    </div>
  );
}

function OptimiserSkeleton() {
  return (
    <div className="space-y-4">
      {/* En-tête : titre + chip verdict + sous-titre */}
      <div className="space-y-2">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-7 w-44 rounded" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-96 max-w-full rounded" />
      </div>
      {/* Panneau du levier : sélecteur + changement + pivot, chiffres, arguments */}
      <div className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        <div className="border-b border-ink-100 bg-accent-50 p-5">
          <Skeleton className="mb-4 h-10 w-80 max-w-full rounded-lg" />
          <Skeleton className="h-8 w-64 max-w-full rounded" />
          <Skeleton className="mt-2 h-3.5 w-full max-w-xl rounded" />
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="p-5">
          <Skeleton className="h-2.5 w-16 rounded" />
          <div className="mt-3 space-y-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-2.5 w-16 rounded" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[0, 1].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnalyseIASkeleton() {
  return (
    <div className="space-y-0">
      {/* Verdict card */}
      <section className="rounded-2xl border border-ink-100 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-5 sm:gap-6">
          <div className="shrink-0 space-y-1.5 text-center">
            <Skeleton className="mx-auto h-12 w-16 rounded-lg" />
            <Skeleton className="mx-auto h-3 w-14 rounded" />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded-full" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-7 w-16 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-7 w-56 max-w-full rounded" />
            <Skeleton className="h-3.5 w-full max-w-md rounded" />
            <Skeleton className="h-3.5 w-3/4 max-w-sm rounded" />
          </div>
        </div>
      </section>

      {/* MetricCards */}
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col rounded-xl border border-ink-100 bg-white p-4">
            <Skeleton className="h-3 w-24 rounded" />
            <Skeleton className="mt-2.5 h-7 w-28 rounded" />
            <Skeleton className="mt-1.5 h-3 w-full rounded" />
            <Skeleton className="mt-auto pt-3 h-3 w-16 self-end rounded" />
          </div>
        ))}
      </div>

      {/* Synthesis block */}
      <div className="mt-6 rounded-xl bg-ink-50 px-5 py-4 space-y-1.5">
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-11/12" />
        <Skeleton className="h-3.5 w-3/4" />
      </div>

      {/* Flat section blocs */}
      <div className="mt-16 flex flex-col">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonFlatSection key={i} faitCount={i === 4 ? 0 : 3} isFirst={i === 0} isLast={i === 4} isQuartier={i === 4} />
        ))}
      </div>
    </div>
  );
}

function SkeletonFlatSection({ faitCount, isFirst, isLast, isQuartier }: { faitCount: number; isFirst: boolean; isLast: boolean; isQuartier?: boolean }) {
  return (
    <div className={`${isFirst ? "pt-0" : "border-t border-ink-100/50 pt-14"} ${isLast ? "pb-0" : "pb-14"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        {!isQuartier && <Skeleton className="h-8 w-12 rounded" />}
      </div>
      <div className="mt-3 space-y-3">
        <div className="rounded-lg bg-ink-50 px-4 py-3 space-y-1.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
        </div>
        {faitCount > 0 && (
          <ul className="divide-y divide-ink-100/50">
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
      </div>
    </div>
  );
}


/**
 * Affiche la miniature plutôt que l'URL brute : en mode lecture, une longue
 * URL wrappée sur 2 lignes déséquilibrait la grille (la cellule voisine du
 * même rang reste courte), et une image est de toute façon plus utile à lire
 * qu'un chemin de fichier.
 */

