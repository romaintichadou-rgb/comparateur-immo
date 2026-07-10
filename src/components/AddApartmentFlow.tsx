"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  Check,
  CheckCircle2,
  Home,
  Info,
  Link2,
  Loader2,
  Sparkles,
  User,
} from "lucide-react";
import {
  DEFAULT_HYPOTHESE_GESTION_PCT,
  DPE_GES_VALEURS,
  ETATS_BIEN,
  PLATEFORMES,
  TYPES_BIEN,
  type ApartmentInput,
  type Plateforme,
} from "@/lib/types";
import type { ParsedListing } from "@/lib/parsers";
import {
  BooleanField,
  ExtractedBadge,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/Fields";
import { LucideMark } from "@/components/Navbar";

function emptyInput(): ApartmentInput {
  return {
    url: "",
    plateforme: "Manuel",
    description: "",
    statut: "à visiter",
    adresse: "",
    quartier: "",
    ville: "",
    code_postal: "",
    code_insee: "",
    latitude: null,
    longitude: null,
    precision_localisation: null,
    type_bien: "Appartement",
    surface_m2: null,
    nb_pieces: null,
    nb_chambres: null,
    etage: "",
    ascenseur: null,
    annee_construction: null,
    etat_bien: "",
    dpe: "",
    ges: "",
    prix: null,
    frais_notaire_estimes: null,
    travaux: null,
    charges_copro_annuelles: null,
    taxe_fonciere: null,
    assurance_annuelle: null,
    loyer_retenu: null,
    loyer_justification: "",
    hypothese_gestion_pct: DEFAULT_HYPOTHESE_GESTION_PCT,
    notes: "",
    score_coup_de_coeur: null,
    photo_url: "",
    contact_nom: "",
    contact_telephone: "",
    contact_email: "",
    champs_manuels: [],
  };
}

type Step = "url" | "review" | "processing";
type Banner = { tone: "info" | "warning" | "success"; text: string } | null;

// Étapes du traitement post-création, jouées en séquence sur l'écran de
// transition (l'estimation du loyer doit précéder l'analyse : le rendement en
// dépend). L'ordre du tableau = l'ordre d'exécution.
type ProcPhase = "creating" | "renting" | "analysing";
const PROC_STEPS: { key: ProcPhase; label: string; detail: string }[] = [
  { key: "creating", label: "Enregistrement du bien", detail: "Géolocalisation (BAN) et sauvegarde de la fiche." },
  { key: "renting", label: "Estimation du loyer de marché", detail: "Loyer de référence du secteur via IA et données publiques." },
  { key: "analysing", label: "Analyse IA complète", detail: "Prix (DVF), risques (ADEME, Géorisques), potentiel du quartier." },
];

function applyParsedFields(
  base: ApartmentInput,
  url: string,
  plateforme: Plateforme,
  data: ParsedListing
): ApartmentInput {
  return {
    ...base,
    url,
    plateforme,
    description: data.description ?? "",
    prix: data.prix ?? null,
    surface_m2: data.surface_m2 ?? null,
    nb_pieces: data.nb_pieces ?? null,
    nb_chambres: data.nb_chambres ?? null,
    etage: data.etage ?? "",
    ascenseur: data.ascenseur ?? null,
    annee_construction: data.annee_construction ?? null,
    etat_bien: data.etat_bien ?? "",
    dpe: data.dpe ?? "",
    ges: data.ges ?? "",
    charges_copro_annuelles: data.charges_copro_annuelles ?? null,
    adresse: data.adresse ?? "",
    quartier: data.quartier ?? "",
    ville: data.ville ?? "",
    code_postal: data.code_postal ?? "",
    photo_url: data.photo_url ?? "",
    contact_telephone: data.contact_telephone ?? base.contact_telephone,
    contact_email: data.contact_email ?? base.contact_email,
  };
}

/** Décodage base64 UTF-8-safe, symétrique de l'encodage fait par le bookmarklet. */
function decodePrefill(encoded: string): (ParsedListing & { url?: string; plateforme?: Plateforme }) | null {
  try {
    return JSON.parse(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return null;
  }
}

interface InitialState {
  step: Step;
  form: ApartmentInput;
  champsExtraits: Set<string>;
  banner: Banner;
}

// Prise en charge du bookmarklet "Importer dans Lucide" : les
// données lues dans la page (déjà chargée par le navigateur de
// l'utilisateur, hors de toute détection anti-bot) arrivent en query param
// au premier rendu — pas besoin d'effect, juste un état initial dérivé.
function computeInitialState(prefillParam: string | null): InitialState {
  if (!prefillParam) {
    return { step: "url", form: emptyInput(), champsExtraits: new Set(), banner: null };
  }

  const decoded = decodePrefill(prefillParam);
  if (!decoded) {
    return {
      step: "review",
      form: emptyInput(),
      champsExtraits: new Set(),
      banner: { tone: "warning", text: "Données du bookmarklet illisibles, saisis à la main." },
    };
  }

  const { url = "", plateforme = "Manuel", ...data } = decoded;
  const extraits = Object.keys(data).filter(
    (k) => data[k as keyof ParsedListing] !== undefined && data[k as keyof ParsedListing] !== ""
  );

  return {
    step: "review",
    form: applyParsedFields(emptyInput(), url, plateforme, data),
    champsExtraits: new Set(extraits),
    banner: {
      tone: "success",
      text: `${extraits.length} champ(s) importé(s) depuis le bookmarklet (${plateforme}). Vérifie et corrige avant d'enregistrer.`,
    },
  };
}

export default function AddApartmentFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [initial] = useState(() => computeInitialState(searchParams.get("prefill")));
  const [step, setStep] = useState<Step>(initial.step);
  const [urlInput, setUrlInput] = useState("");
  const [analysing, setAnalysing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [procPhase, setProcPhase] = useState<ProcPhase>("creating");
  const [banner, setBanner] = useState<Banner>(initial.banner);
  const [champsExtraits, setChampsExtraits] = useState<Set<string>>(initial.champsExtraits);
  const [form, setForm] = useState<ApartmentInput>(initial.form);

  function set<K extends keyof ApartmentInput>(key: K, value: ApartmentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleAnalyse() {
    if (!urlInput.trim()) {
      setStep("review");
      setBanner(null);
      return;
    }
    setAnalysing(true);
    setBanner(null);
    try {
      const res = await fetch("/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const result = await res.json();

      const plateforme: Plateforme = result.plateforme ?? "Manuel";
      const data: ParsedListing = result.data ?? {};
      const extraits: string[] = result.champsExtraits ?? [];

      setForm((f) => applyParsedFields(f, urlInput.trim(), plateforme, data));
      setChampsExtraits(new Set(extraits));

      if (!result.ok) {
        setBanner({
          tone: result.blocked ? "warning" : "info",
          text:
            result.message ??
            "Impossible d'extraire les données automatiquement. Complète les champs manuellement.",
        });
      } else {
        setBanner({
          tone: "success",
          text: `${extraits.length} champ(s) extrait(s) automatiquement depuis ${plateforme}. Vérifie et corrige avant d'enregistrer.`,
        });
      }
    } catch {
      setBanner({
        tone: "warning",
        text: "Erreur réseau pendant l'analyse. Complète les champs manuellement.",
      });
    } finally {
      setAnalysing(false);
      setStep("review");
    }
  }

  async function handleSubmit() {
    setSaving(true);
    setStep("processing");
    setProcPhase("creating");

    // 1) Création du bien (bloquant : sans id, rien ne suit).
    let apartmentId: string;
    try {
      const res = await fetch("/api/apartments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const err = await res.json();
        setBanner({ tone: "warning", text: err.error ?? "Échec de l'enregistrement." });
        setStep("review");
        setSaving(false);
        return;
      }
      apartmentId = (await res.json()).apartment.id;
    } catch {
      setBanner({ tone: "warning", text: "Erreur réseau pendant l'enregistrement." });
      setStep("review");
      setSaving(false);
      return;
    }

    // 2) Estimation du loyer (best-effort) — AVANT l'analyse, car le rendement
    //    du bloc "Potentiel locatif" en dépend.
    setProcPhase("renting");
    try {
      await fetch("/api/estimate-rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId }),
      });
    } catch {
      // non bloquant : le loyer pourra être réestimé depuis la fiche.
    }

    // 3) Analyse IA complète (best-effort) — relançable depuis la fiche.
    setProcPhase("analysing");
    try {
      await fetch(`/api/analyse/${apartmentId}`, { method: "POST" });
    } catch {
      // non bloquant : l'analyse pourra être relancée depuis la fiche.
    }

    // 4) Redirection vers la fiche (onglet Analyse IA par défaut).
    router.push(`/appartements/${apartmentId}`);
  }

  const extrait = (key: string) => champsExtraits.has(key);

  if (step === "processing") {
    return <ProcessingScreen procPhase={procPhase} />;
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 transition-colors hover:text-accent-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la liste
      </Link>

      <div className="mt-4 mb-8">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">
          Ajouter un bien
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Colle une annonce ou saisis les infos à la main — le loyer et l&apos;analyse du
          quartier se font automatiquement juste après.
        </p>
      </div>

      {step === "url" && (
        <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          <div className="relative overflow-hidden bg-gradient-to-br from-accent-50 via-white to-white p-6 sm:p-8">
            <LucideMark className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 text-accent-600 opacity-[0.07]" />
            <span className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-accent-100/70 blur-3xl" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white shadow-sm shadow-accent-200">
                <Link2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-ink-900">
                  Colle l&apos;URL d&apos;une annonce
                </h2>
                <p className="mt-0.5 text-sm text-ink-500">
                  Leboncoin, SeLoger, PAP ou Orpi — les champs détectés seront pré-remplis, à
                  vérifier avant d&apos;enregistrer.
                </p>
              </div>
            </div>

            <div className="relative mt-5 flex flex-col gap-2.5 sm:flex-row">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://www.leboncoin.fr/ad/..."
                className="flex-1 rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-sm transition-colors focus:border-accent-500 focus:outline-none focus:ring-1 focus:ring-accent-500"
              />
              <button
                onClick={handleAnalyse}
                disabled={analysing}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
              >
                {analysing && <Loader2 className="h-4 w-4 animate-spin" />}
                {analysing ? "Analyse en cours…" : "Analyser"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-ink-100 bg-ink-50/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
            <button
              onClick={() => setStep("review")}
              className="text-sm font-medium text-ink-600 underline decoration-ink-300 underline-offset-2 transition-colors hover:text-ink-900"
            >
              Ou saisir directement à la main, sans URL
            </button>
            <Link
              href="/bookmarklet"
              className="text-sm font-medium text-accent-600 transition-colors hover:text-accent-800"
            >
              Site protégé contre le scraping ? Utilise le bookmarklet →
            </Link>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-6 pb-8">
          {banner && <BannerCard banner={banner} />}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* Colonne principale */}
            <div className="min-w-0 space-y-6">
              <section className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="flex items-center gap-3 text-sm font-semibold text-ink-900">
                  <SectionIcon icon={Home} />
                  Description du bien
                </h2>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <SelectField
                    label="Plateforme"
                    value={form.plateforme}
                    onChange={(v) => set("plateforme", v)}
                    options={PLATEFORMES}
                    allowEmpty={false}
                  />
                  <TextField label="Ville" value={form.ville} onChange={(v) => set("ville", v)} hint={extrait("ville") && <ExtractedBadge />} />
                  <TextField label="Quartier" value={form.quartier} onChange={(v) => set("quartier", v)} hint={extrait("quartier") && <ExtractedBadge />} />
                  <TextField label="Adresse (si connue)" value={form.adresse} onChange={(v) => set("adresse", v)} hint={extrait("adresse") && <ExtractedBadge />} />
                  <TextField label="Code postal" value={form.code_postal} onChange={(v) => set("code_postal", v)} hint={extrait("code_postal") && <ExtractedBadge />} />
                  <SelectField
                    label="Type de bien"
                    value={form.type_bien as (typeof TYPES_BIEN)[number] | ""}
                    onChange={(v) => set("type_bien", v)}
                    options={TYPES_BIEN}
                  />
                  <NumberField label="Surface" value={form.surface_m2} onChange={(v) => set("surface_m2", v)} suffix="m²" hint={extrait("surface_m2") && <ExtractedBadge />} />
                  <NumberField label="Nb pièces" value={form.nb_pieces} onChange={(v) => set("nb_pieces", v)} hint={extrait("nb_pieces") && <ExtractedBadge />} />
                  <NumberField label="Nb chambres" value={form.nb_chambres} onChange={(v) => set("nb_chambres", v)} hint={extrait("nb_chambres") && <ExtractedBadge />} />
                  <TextField label="Étage" value={form.etage} onChange={(v) => set("etage", v)} hint={extrait("etage") && <ExtractedBadge />} />
                  <BooleanField label="Ascenseur" value={form.ascenseur} onChange={(v) => set("ascenseur", v)} />
                  <NumberField
                    label="Année de construction"
                    value={form.annee_construction}
                    onChange={(v) => set("annee_construction", v)}
                  />
                  <SelectField
                    label="État du bien"
                    value={form.etat_bien as (typeof ETATS_BIEN)[number] | ""}
                    onChange={(v) => set("etat_bien", v)}
                    options={ETATS_BIEN}
                  />
                  <SelectField label="DPE" value={form.dpe as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => set("dpe", v)} options={DPE_GES_VALEURS} />
                  <SelectField label="GES" value={form.ges as (typeof DPE_GES_VALEURS)[number] | ""} onChange={(v) => set("ges", v)} options={DPE_GES_VALEURS} />
                  <TextField label="Photo (URL)" value={form.photo_url} onChange={(v) => set("photo_url", v)} hint={extrait("photo_url") && <ExtractedBadge />} />
                </div>
                <TextAreaField label="Description" value={form.description} onChange={(v) => set("description", v)} />
              </section>

              <section className="space-y-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm sm:p-8">
                <div>
                  <h2 className="flex items-center gap-3 text-sm font-semibold text-ink-900">
                    <SectionIcon icon={Banknote} />
                    Données financières
                  </h2>
                  <p className="mt-3 rounded-lg bg-ink-50 px-3.5 py-2.5 text-xs leading-relaxed text-ink-500">
                    Les frais de notaire, l&apos;assurance et les frais de gestion sont pré-estimés
                    automatiquement (modifiables depuis la fiche du bien après création). Les
                    champs ci-dessous laissés vides (charges copro, taxe foncière) seront eux
                    aussi pré-estimés. Le loyer sera estimé via IA juste après l&apos;enregistrement.
                  </p>
                </div>

                <Subsection title="Achat" accent="bg-ink-400">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <NumberField label="Prix" value={form.prix} onChange={(v) => set("prix", v)} suffix="€" hint={extrait("prix") && <ExtractedBadge />} />
                    <NumberField
                      label="Travaux"
                      value={form.travaux}
                      onChange={(v) => set("travaux", v)}
                      suffix="€"
                    />
                  </div>
                </Subsection>

                <Subsection title="Charges annuelles" accent="bg-amber-400">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <NumberField
                      label="Charges copro annuelles (laisser vide = estimées)"
                      value={form.charges_copro_annuelles}
                      onChange={(v) => set("charges_copro_annuelles", v)}
                      suffix="€/an"
                      hint={extrait("charges_copro_annuelles") && <ExtractedBadge />}
                    />
                    <NumberField
                      label="Taxe foncière (laisser vide = estimée)"
                      value={form.taxe_fonciere}
                      onChange={(v) => set("taxe_fonciere", v)}
                      suffix="€/an"
                    />
                  </div>
                </Subsection>
              </section>
            </div>

            {/* Colonne latérale */}
            <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
                <h2 className="flex items-center gap-3 text-sm font-semibold text-ink-900">
                  <SectionIcon icon={User} size="sm" />
                  Contact
                </h2>
                <p className="mt-2 mb-4 text-xs text-ink-400">
                  Agence ou propriétaire — facultatif.
                </p>
                <div className="space-y-3">
                  <TextField label="Nom" value={form.contact_nom} onChange={(v) => set("contact_nom", v)} />
                  <TextField
                    label="Téléphone"
                    value={form.contact_telephone}
                    onChange={(v) => set("contact_telephone", v)}
                    hint={extrait("contact_telephone") && <ExtractedBadge />}
                  />
                  <TextField
                    label="Email"
                    value={form.contact_email}
                    onChange={(v) => set("contact_email", v)}
                    hint={extrait("contact_email") && <ExtractedBadge />}
                  />
                </div>
              </div>

              <button
                onClick={handleSubmit}
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-700 disabled:opacity-50"
              >
                {saving && <Loader2 className="h-5 w-5 animate-spin" />}
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}

/** Icône de section, dans un badge circulaire teinté — remplace l'icône grise
 * plate pour donner un peu plus de repère visuel à chaque bloc du formulaire. */
function SectionIcon({
  icon: Icon,
  size = "md",
}: {
  icon: typeof Home;
  size?: "sm" | "md";
}) {
  const dims = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const iconDims = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  return (
    <span className={`flex ${dims} shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600`}>
      <Icon className={iconDims} />
    </span>
  );
}

const BANNER_STYLES = {
  success: { wrap: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2, iconClass: "text-emerald-500" },
  warning: { wrap: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle, iconClass: "text-amber-500" },
  info: { wrap: "border-ink-200 bg-ink-50 text-ink-700", icon: Info, iconClass: "text-ink-400" },
} as const;

function BannerCard({ banner }: { banner: NonNullable<Banner> }) {
  const style = BANNER_STYLES[banner.tone];
  const Icon = style.icon;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-sm ${style.wrap}`}>
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconClass}`} />
      <span>{banner.text}</span>
    </div>
  );
}

function Subsection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-ink-100 pt-6 first:border-t-0 first:pt-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-400">
        <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
        {title}
      </h3>
      {children}
    </div>
  );
}

/**
 * Écran de transition affiché pendant la création + estimation loyer + analyse
 * IA. Les étapes se cochent au fil de l'avancement (procPhase). Aucune action
 * de l'utilisateur : à la fin, redirection automatique vers la fiche du bien.
 */
function ProcessingScreen({ procPhase }: { procPhase: ProcPhase }) {
  const currentIndex = PROC_STEPS.findIndex((s) => s.key === procPhase);

  return (
    <div className="flex min-h-[calc(100vh-120px)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center">
        {/* Illustration */}
        <div className="relative mx-auto mb-8 h-40 w-40">
          <span className="absolute inset-0 animate-ping rounded-full bg-accent-100 opacity-60" />
          <span className="absolute inset-2 rounded-full bg-accent-50" />
          <svg viewBox="0 0 120 120" className="relative h-full w-full" aria-hidden="true">
            {/* immeuble */}
            <rect x="34" y="40" width="34" height="52" rx="2" className="fill-accent-600" />
            <rect x="68" y="52" width="22" height="40" rx="2" className="fill-accent-400" />
            {[46, 58, 70].map((y) => (
              <g key={y}>
                <rect x="40" y={y} width="6" height="6" rx="1" className="fill-white/80" />
                <rect x="52" y={y} width="6" height="6" rx="1" className="fill-white/80" />
              </g>
            ))}
            <rect x="74" y="60" width="5" height="5" rx="1" className="fill-white/80" />
            <rect x="82" y="60" width="5" height="5" rx="1" className="fill-white/80" />
            <rect x="74" y="72" width="5" height="5" rx="1" className="fill-white/80" />
            <rect x="82" y="72" width="5" height="5" rx="1" className="fill-white/80" />
            {/* loupe (analyse) */}
            <circle cx="76" cy="42" r="15" className="fill-none stroke-ink-900" strokeWidth="4" />
            <circle cx="76" cy="42" r="15" className="fill-white/70" />
            <line x1="87" y1="53" x2="98" y2="64" className="stroke-ink-900" strokeWidth="5" strokeLinecap="round" />
            <path d="M69 44 l4 4 l9 -11" className="fill-none stroke-accent-600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="font-display flex items-center justify-center gap-2 text-2xl font-semibold text-ink-900">
          <Sparkles className="h-5 w-5 text-accent-500" />
          Analyse de votre bien en cours
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Nous enregistrons le bien puis collectons des données publiques réelles (DVF, ADEME,
          Géorisques, loyers, sécurité…) pour bâtir votre analyse. Quelques dizaines de secondes,
          aucune action requise.
        </p>

        {/* Étapes */}
        <ol className="mx-auto mt-8 max-w-md space-y-3 text-left">
          {PROC_STEPS.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "active" : "pending";
            return (
              <li
                key={s.key}
                className={`flex items-start gap-3 rounded-lg border p-3 transition ${
                  state === "active"
                    ? "border-accent-200 bg-accent-50/60"
                    : "border-ink-200 bg-white"
                }`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <Check className="h-5 w-5 text-emerald-500" />
                  ) : state === "active" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-accent-600" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-ink-300" />
                  )}
                </span>
                <span>
                  <span
                    className={`block text-sm font-medium ${
                      state === "pending" ? "text-ink-400" : "text-ink-800"
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block text-xs text-ink-400">{s.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
