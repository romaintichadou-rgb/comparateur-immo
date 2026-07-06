"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Banknote, Check, ClipboardList, Home, Loader2, Sparkles, Star, User } from "lucide-react";
import {
  DEFAULT_HYPOTHESE_GESTION_PCT,
  DPE_GES_VALEURS,
  ETATS_BIEN,
  PLATEFORMES,
  STATUTS,
  TYPES_BIEN,
  type ApartmentInput,
  type Plateforme,
  type Statut,
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

const STATUT_STYLES: Record<string, string> = {
  "à visiter": "bg-blue-50 text-blue-700",
  visité: "bg-violet-50 text-violet-700",
  abandonné: "bg-slate-100 text-slate-500",
  acheté: "bg-emerald-50 text-emerald-700",
};

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

// Prise en charge du bookmarklet "Importer dans Comparateur locatif" : les
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
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la liste
      </Link>

      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Ajouter un bien</h1>

      {step === "url" && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">
            Colle l&apos;URL d&apos;une annonce Leboncoin, SeLoger, PAP ou Orpi. Les champs
            détectés seront pré-remplis, à vérifier avant d&apos;enregistrer.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://www.leboncoin.fr/ad/..."
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
            />
            <button
              onClick={handleAnalyse}
              disabled={analysing}
              className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {analysing ? "Analyse..." : "Analyser"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              onClick={() => setStep("review")}
              className="text-sm text-slate-500 underline hover:text-slate-700"
            >
              Ou saisir directement à la main, sans URL
            </button>
            <Link
              href="/bookmarklet"
              className="text-sm text-indigo-600 underline hover:text-indigo-800"
            >
              Site protégé contre le scraping ? Utilise le bookmarklet →
            </Link>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="space-y-6">
          {banner && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                banner.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : banner.tone === "warning"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              {banner.text}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            {/* Colonne principale */}
            <div className="min-w-0 space-y-6">
              <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  <Home className="h-4 w-4 text-slate-400" />
                  Description du bien
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

              <section className="space-y-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                    <Banknote className="h-4 w-4 text-slate-400" />
                    Analyse financière
                  </h2>
                  <p className="mt-2 text-xs text-slate-500">
                    Les champs laissés vides (frais de notaire, charges, taxe foncière, assurance)
                    seront pré-estimés automatiquement. Le loyer sera estimé via IA juste après
                    l&apos;enregistrement.
                  </p>
                </div>

                <Subsection title="Achat" accent="bg-slate-400">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <NumberField label="Prix" value={form.prix} onChange={(v) => set("prix", v)} suffix="€" hint={extrait("prix") && <ExtractedBadge />} />
                    <NumberField
                      label="Travaux"
                      value={form.travaux}
                      onChange={(v) => set("travaux", v)}
                      suffix="€"
                    />
                    <NumberField
                      label="Frais de notaire (laisser vide = estimé)"
                      value={form.frais_notaire_estimes}
                      onChange={(v) => set("frais_notaire_estimes", v)}
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
                    <NumberField
                      label="Assurance (laisser vide = estimée)"
                      value={form.assurance_annuelle}
                      onChange={(v) => set("assurance_annuelle", v)}
                      suffix="€/an"
                    />
                    <NumberField
                      label="Hypothèse frais de gestion locative"
                      value={form.hypothese_gestion_pct}
                      onChange={(v) => set("hypothese_gestion_pct", v ?? 0)}
                      suffix="%"
                    />
                  </div>
                </Subsection>
              </section>
            </div>

            {/* Colonne latérale */}
            <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  <ClipboardList className="h-4 w-4 text-slate-400" />
                  Suivi
                </h2>
                <div className="space-y-4">
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Statut</span>
                    <select
                      value={form.statut}
                      onChange={(e) => set("statut", e.target.value as Statut)}
                      className={`w-full rounded-full border-0 px-3 py-1.5 text-sm font-medium ${
                        STATUT_STYLES[form.statut] ?? "bg-slate-100 text-slate-600"
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
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Coup de cœur</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() =>
                            set("score_coup_de_coeur", form.score_coup_de_coeur === n ? null : n)
                          }
                          className="text-amber-400 transition hover:scale-110"
                          aria-label={`${n} étoile(s)`}
                        >
                          <Star
                            className="h-6 w-6"
                            fill={form.score_coup_de_coeur != null && n <= form.score_coup_de_coeur ? "currentColor" : "none"}
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                  <TextAreaField label="Notes libres" value={form.notes} onChange={(v) => set("notes", v)} rows={3} />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  <User className="h-4 w-4 text-slate-400" />
                  Contact
                </h2>
                <p className="mb-3 text-xs text-slate-400">
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
            </aside>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setStep("url")}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Retour
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-md bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer le bien"}
            </button>
          </div>
        </div>
      )}
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
    <div className="border-t border-slate-100 pt-6 first:border-t-0 first:pt-0">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
          <span className="absolute inset-0 animate-ping rounded-full bg-indigo-100 opacity-60" />
          <span className="absolute inset-2 rounded-full bg-indigo-50" />
          <svg viewBox="0 0 120 120" className="relative h-full w-full" aria-hidden="true">
            {/* immeuble */}
            <rect x="34" y="40" width="34" height="52" rx="2" className="fill-indigo-600" />
            <rect x="68" y="52" width="22" height="40" rx="2" className="fill-indigo-400" />
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
            <circle cx="76" cy="42" r="15" className="fill-none stroke-slate-900" strokeWidth="4" />
            <circle cx="76" cy="42" r="15" className="fill-white/70" />
            <line x1="87" y1="53" x2="98" y2="64" className="stroke-slate-900" strokeWidth="5" strokeLinecap="round" />
            <path d="M69 44 l4 4 l9 -11" className="fill-none stroke-indigo-600" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold text-slate-900">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          Analyse de votre bien en cours
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
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
                    ? "border-indigo-200 bg-indigo-50/60"
                    : "border-slate-200 bg-white"
                }`}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {state === "done" ? (
                    <Check className="h-5 w-5 text-emerald-500" />
                  ) : state === "active" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
                  )}
                </span>
                <span>
                  <span
                    className={`block text-sm font-medium ${
                      state === "pending" ? "text-slate-400" : "text-slate-800"
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="block text-xs text-slate-400">{s.detail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
