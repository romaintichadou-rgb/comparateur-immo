"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Banknote,
  Landmark,
  TrendingUp,
  SlidersHorizontal,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Info,
  type LucideIcon,
} from "lucide-react";
import {
  FINANCEMENT_MODE_INFOS,
  type AppSettings,
  type FinancementMode,
} from "@/lib/settings";
import { NumberField, SelectField } from "@/components/form/Fields";

/** Mêmes options que l'onglet Simulation financière — une TMI est une tranche
 * légale, pas une saisie libre. */
const TMI_OPTIONS = ["11", "30", "41", "45"] as const;
const FINANCEMENT_MODES = ["hors_notaire", "cout_total"] as const satisfies readonly FinancementMode[];

type BannerPhase = "saving" | "success" | "error";

interface BannerState {
  phase: BannerPhase;
  label: string;
}

function useBanner() {
  const [banner, setBanner] = useState<BannerState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    clearTimeout(timerRef.current);
    setBanner({ phase: "saving", label: "Enregistrement en cours…" });
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timerRef.current);
    setBanner(null);
  }, []);

  const resolve = useCallback((ok: boolean, label?: string) => {
    clearTimeout(timerRef.current);
    const phase: BannerPhase = ok ? "success" : "error";
    setBanner({
      phase,
      label: label ?? (ok ? "Profil enregistré avec succès." : "Échec de l'enregistrement."),
    });
    timerRef.current = setTimeout(dismiss, ok ? 3000 : 6000);
  }, [dismiss]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  return { banner, show, resolve, dismiss } as const;
}

function toggleInSet(prev: Set<string>, id: string): Set<string> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export default function SettingsForm({ initial }: { initial: AppSettings }) {
  const [values, setValues] = useState<AppSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [openTooltips, setOpenTooltips] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { banner, show: showBanner, resolve: resolveBanner } = useBanner();

  const toggleTooltip = useCallback((id: string) => {
    setOpenTooltips((prev) => toggleInSet(prev, id));
  }, []);

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => toggleInSet(prev, id));
  }, []);

  function set<K extends keyof AppSettings>(key: K, v: number | null) {
    setValues((s) => ({ ...s, [key]: v ?? 0 }));
  }

  /** Champs non numériques (mode de financement) — `set` coerce `null → 0`. */
  function setMode(v: FinancementMode) {
    setValues((s) => ({ ...s, financementMode: v }));
  }

  const rendementValide = values.rendementSeuilVertPct > values.rendementSeuilRougePct;
  const cashflowValide = values.cashflowSeuilVertEuros > values.cashflowSeuilRougeEuros;

  async function handleSave() {
    setSaving(true);
    showBanner();
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (res.ok) {
        setValues(data.settings);
        resolveBanner(true, "Profil enregistré avec succès.");
      } else {
        resolveBanner(false, data.error ?? "Échec de l'enregistrement.");
      }
    } catch {
      resolveBanner(false, "Erreur réseau pendant l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {banner && <SettingsBanner phase={banner.phase} label={banner.label} />}
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:px-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink-900">Profil investisseur</h1>
          <p className="mt-1 text-sm text-ink-500">Tes conditions d&apos;emprunt et seuils par défaut</p>
        </div>
        <div className="relative shrink-0 pt-0.5">
          <button
            onClick={() => toggleTooltip("main")}
            className="rounded-full p-1 hover:bg-ink-100"
            aria-label="Informations sur le profil investisseur"
          >
            <Info className="h-5 w-5 text-ink-400 hover:text-ink-600" />
          </button>
          <div className={`absolute right-0 top-8 z-10 w-48 rounded-lg border border-ink-200 bg-white p-3 text-xs text-ink-700 shadow-lg transition-opacity ${
            openTooltips.has("main") ? "block" : "hidden sm:group-hover:block"
          }`}>
            Appliqué à tous tes biens. Tu peux surcharger les valeurs bien par bien dans leur Simulation financière.
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
            <Landmark className="h-4 w-4 text-accent-600" />
            Profil emprunteur
          </h2>
          <div className="group relative">
            <button
              onClick={() => toggleTooltip("borrower")}
              className="rounded p-0.5 hover:bg-ink-100"
              aria-label="Informations sur le profil emprunteur"
            >
              <Info className="h-4 w-4 text-ink-400 hover:text-ink-600" />
            </button>
            <div className={`absolute right-0 top-6 z-10 w-56 rounded-lg border border-ink-200 bg-white p-2.5 text-xs text-ink-700 shadow-lg transition-opacity ${
              openTooltips.has("borrower") ? "block" : "hidden group-hover:block"
            }`}>
              Modifie ces valeurs peut rendre les analyses obsolètes. Chaque bien te proposera de les relancer.
            </div>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <NumberField
            label="Taux du crédit"
            value={values.tauxCreditPct}
            onChange={(v) => set("tauxCreditPct", v)}
            suffix="%/an"
          />
          <NumberField
            label="Assurance emprunteur"
            value={values.tauxAssurancePct}
            onChange={(v) => set("tauxAssurancePct", v)}
            suffix="%/an"
          />
          <NumberField
            label="Durée du crédit"
            value={values.dureeAnnees}
            // Mêmes bornes que l'onglet Simulation financière (1–35 ans).
            onChange={(v) => set("dureeAnnees", Math.max(1, Math.min(35, v ?? 25)))}
            suffix="ans"
          />
          <div className="group">
            <SelectField
              label="TMI"
              value={String(values.tmiPct) as (typeof TMI_OPTIONS)[number]}
              onChange={(v) => set("tmiPct", Number(v))}
              options={TMI_OPTIONS}
              allowEmpty={false}
            />
            <p className="mt-0.5 text-[10px] text-ink-400">Tranche marginale d&apos;imposition</p>
          </div>
        </div>
        {/* Cartes radio, PAS un <select> : les deux modes s'excluent et se
            comparent — les enfermer dans une liste déroulante cache l'option
            concurrente au moment précis où il faut trancher. À deux options
            décrites en trois lignes chacune, le coût en hauteur est nul. */}
        <fieldset className="mt-6">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-medium text-ink-700">
              Couverture de l&apos;emprunt
            </legend>
            <div className="group relative">
              <button
                onClick={() => toggleTooltip("coverage")}
                className="rounded p-0.5 hover:bg-ink-100"
                aria-label="Informations sur la couverture de l'emprunt"
              >
                <Info className="h-4 w-4 text-ink-400 hover:text-ink-600" />
              </button>
              <div className={`absolute right-0 top-6 z-10 w-56 rounded-lg border border-ink-200 bg-white p-2.5 text-xs text-ink-700 shadow-lg transition-opacity ${
                openTooltips.has("coverage") ? "block" : "hidden group-hover:block"
              }`}>
                Base du montant emprunté. Modifiable bien par bien.
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            {FINANCEMENT_MODES.map((mode) => {
              const info = FINANCEMENT_MODE_INFOS[mode];
              const actif = values.financementMode === mode;
              return (
                <label key={mode} className="cursor-pointer">
                  <input
                    type="radio"
                    name="financementMode"
                    value={mode}
                    checked={actif}
                    onChange={() => setMode(mode)}
                    className="peer sr-only"
                    // Sans ça, le nom accessible est la concaténation brute des
                    // trois spans — « les travauxLes frais de notaire… », sans
                    // séparation ni ponctuation. On le dicte, ponctué, en
                    // gardant la conséquence sur l'apport : c'est elle qui fait
                    // choisir.
                    aria-label={`${info.titre}. ${info.detail} ${info.apport}.`}
                  />
                  <span
                    className={`flex gap-2.5 rounded-lg border p-4 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-600 ${
                      actif
                        ? "border-accent-600 bg-accent-50"
                        : "border-ink-200 bg-white hover:border-ink-300"
                    }`}
                  >
                    {/* Puce radio dessinée : l'input est en `sr-only` pour que la
                        carte entière soit la cible de clic, mais l'état doit
                        rester visible sans dépendre du seul fond. */}
                    <span
                      aria-hidden
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        actif ? "border-accent-600" : "border-ink-300"
                      }`}
                    >
                      {actif && <span className="h-2 w-2 rounded-full bg-accent-600" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${actif ? "text-accent-800" : "text-ink-800"}`}>
                        {info.titre}
                      </span>
                      <span className="mt-1 block text-[11px] leading-tight text-ink-500">
                        {info.detail}
                      </span>
                      <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium font-mono tabular-nums ${
                        actif
                          ? "bg-accent-100 text-accent-700"
                          : "bg-ink-100 text-ink-600"
                      }`}>
                        {info.apport}
                      </span>
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </section>

      <CollapsibleSection
        id="seuils"
        icon={SlidersHorizontal}
        title="Seuils de décision"
        isOpen={expandedSections.has("seuils")}
        onToggle={toggleSection}
      >
        <p className="text-xs leading-relaxed text-ink-600">
          Ces deux seuils colorent les chiffres dans toute l&apos;app — vert au-dessus du seuil
          vert, ambre entre les deux, rouge en dessous du seuil rouge — et pèsent sur le score
          global de chaque bien.
        </p>

        <SeuilGroup
          icon={TrendingUp}
          titre="Rendement net"
          description="Le loyer annuel, net de charges et d'impôts, rapporté au coût total de l'opération."
          rougeLabel="Seuil rouge"
          rougeHint="En dessous, le bien est écarté : le score global est plafonné à 5/10."
          vertLabel="Seuil vert"
          vertHint="Au-dessus, ton objectif de rentabilité est atteint."
          suffix="%/an"
          vert={values.rendementSeuilVertPct}
          rouge={values.rendementSeuilRougePct}
          onVertChange={(v) => set("rendementSeuilVertPct", v)}
          onRougeChange={(v) => set("rendementSeuilRougePct", v)}
          formatValue={(v) => `${v.toFixed(1).replace(".", ",")} %`}
          valide={rendementValide}
        />

        <hr className="border-t border-ink-100/50" />

        <SeuilGroup
          icon={Banknote}
          titre="Cash-flow mensuel"
          description="Ce qu'il reste chaque mois une fois le crédit, les charges et l'impôt payés."
          rougeLabel="Seuil rouge"
          rougeHint="En dessous, l'effort d'épargne mensuel devient un point d'alerte."
          vertLabel="Seuil vert"
          vertHint="Au-dessus, l'opération s'autofinance selon tes critères."
          suffix="€/mois"
          vert={values.cashflowSeuilVertEuros}
          rouge={values.cashflowSeuilRougeEuros}
          onVertChange={(v) => set("cashflowSeuilVertEuros", v)}
          onRougeChange={(v) => set("cashflowSeuilRougeEuros", v)}
          formatValue={(v) => `${Math.round(v)} €`}
          valide={cashflowValide}
        />
      </CollapsibleSection>

      <div>
        {(saving || !rendementValide || !cashflowValide) && (
          <div className="mb-3 flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <p className="text-xs text-amber-800">
              {!rendementValide || !cashflowValide ? "Vérifie que tous les seuils sont valides (vert > rouge)." : "Enregistrement en cours…"}
            </p>
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !rendementValide || !cashflowValide}
          className="w-full rounded-lg bg-accent-600 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-disabled={saving || !rendementValide || !cashflowValide}
        >
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </div>
      </div>
    </>
  );
}

const BANNER_STYLES: Record<BannerPhase, { bg: string; border: string; text: string }> = {
  saving: { bg: "bg-accent-50/80", border: "border-accent-200", text: "text-accent-800" },
  success: { bg: "bg-emerald-50/80", border: "border-emerald-200", text: "text-emerald-800" },
  error: { bg: "bg-red-50/80", border: "border-red-200", text: "text-red-800" },
};

const BANNER_ICON: Record<BannerPhase, typeof Loader2> = {
  saving: Loader2,
  success: CheckCircle2,
  error: AlertCircle,
};

function SettingsBanner({ phase, label }: BannerState) {
  const s = BANNER_STYLES[phase];
  const Icon = BANNER_ICON[phase];
  return (
    <div className={`fixed top-0 left-0 right-0 z-40 animate-banner-in border-b backdrop-blur ${s.bg} ${s.border}`}>
      <div className={`mx-auto flex max-w-6xl items-center gap-2.5 px-4 py-3 text-xs font-medium sm:px-6 ${s.text}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${phase === "saving" ? "animate-spin" : ""}`} />
        <span className="flex-1">{label}</span>
      </div>
      {phase === "saving" && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-accent-100">
          <span className="progress-indeterminate block h-full w-full bg-accent-600" />
        </div>
      )}
    </div>
  );
}

function CollapsibleSection({
  id,
  icon: Icon,
  title,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  isOpen: boolean;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <button
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        aria-controls={`section-${id}`}
        className="flex w-full items-center justify-between px-6 py-4 transition-colors hover:bg-ink-50 sm:pointer-events-none sm:cursor-default sm:hover:bg-transparent"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
          <Icon className="h-4 w-4 text-accent-600" />
          {title}
        </h2>
        <ChevronDown
          className={`h-5 w-5 text-ink-400 transition-transform sm:hidden ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      <div id={`section-${id}`} className={`space-y-5 px-6 pb-6 sm:block ${isOpen ? "block" : "hidden"}`}>
        {children}
      </div>
    </div>
  );
}

/** Un couple de seuils (rouge / vert) pour une métrique. Rendu comme un groupe
 *  au sein de la carte « Seuils de décision », pas comme une carte autonome. */
function SeuilGroup({
  icon: Icon,
  titre,
  description,
  rougeLabel,
  rougeHint,
  vertLabel,
  vertHint,
  suffix,
  vert,
  rouge,
  onVertChange,
  onRougeChange,
  formatValue,
  valide,
}: {
  icon: LucideIcon;
  titre: string;
  description: string;
  rougeLabel: string;
  rougeHint: string;
  vertLabel: string;
  vertHint: string;
  suffix: string;
  vert: number;
  rouge: number;
  onVertChange: (v: number | null) => void;
  onRougeChange: (v: number | null) => void;
  formatValue: (v: number) => string;
  valide: boolean;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <Icon className="h-4 w-4 text-ink-400" />
          {titre}
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-ink-600">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <NumberField label={rougeLabel} value={rouge} onChange={onRougeChange} suffix={suffix} />
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{rougeHint}</p>
        </div>
        <div>
          <NumberField label={vertLabel} value={vert} onChange={onVertChange} suffix={suffix} />
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">{vertHint}</p>
        </div>
      </div>

      {!valide && (
        <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs text-amber-800">
            Le seuil vert doit être supérieur au seuil rouge.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <div className="flex h-1.5 overflow-hidden rounded-full">
          <div className={`flex-1 ${valide ? "bg-red-400" : "bg-ink-200"}`} />
          <div className={`flex-1 ${valide ? "bg-amber-400" : "bg-ink-200"}`} />
          <div className={`flex-1 ${valide ? "bg-emerald-400" : "bg-ink-200"}`} />
        </div>
        <div className="flex justify-between font-mono text-[10px] tabular-nums text-ink-400">
          <span>R {formatValue(rouge)}</span>
          <span>V {formatValue(vert)}</span>
        </div>
      </div>
    </section>
  );
}
