"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Banknote, TrendingUp, Wallet, ChevronDown, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { GroupTitle, SectionHeader } from "@/components/SectionHeader";
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
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const { banner, show: showBanner, resolve: resolveBanner } = useBanner();

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
      {/* Pas d'icône « i » ici : son contenu tenait en une phrase, et un tooltip
          isolé à l'autre bout du titre se lit comme un élément orphelin. */}
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">Profil investisseur</h1>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-500">
          Tes conditions d&apos;emprunt et tes seuils par défaut, appliqués à tous tes biens.
          Chaque bien peut les surcharger dans sa Simulation financière.
        </p>
      </div>

      <section className="rounded-xl border border-ink-200 bg-white p-6">
        <SectionHeader title="Profil emprunteur" />
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Les modifier rend les analyses déjà calculées obsolètes : chaque bien te proposera
          de relancer la sienne.
        </p>
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
          <GroupHeading
            as="legend"
            titre="Couverture de l'emprunt"
            description="Ce que couvre l'emprunt tant que tu ne saisis pas de montant sur un bien."
          />
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
        title="Seuils de décision"
        isOpen={expandedSections.has("seuils")}
        onToggle={toggleSection}
      >
        {/* Une seule ligne : la répartition des couleurs est MONTRÉE par la barre
            de chaque groupe, la redire en prose faisait doublon. */}
        <p className="text-xs leading-relaxed text-ink-500">
          Ils colorent les chiffres dans toute l&apos;app et pèsent sur le score de chaque bien.
        </p>

        <SeuilGroup
          titre="Rendement net"
          description="Le loyer annuel, net de charges et d'impôts, rapporté au coût total de l'opération."
          rougeLabel="Seuil rouge"
          rougeHint="En dessous, le score global du bien est plafonné à 5/10."
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
          titre="Cash-flow mensuel"
          description="Ce qu'il reste chaque mois une fois le crédit, les charges et l'impôt payés."
          rougeLabel="Seuil rouge"
          rougeHint="En dessous, l'effort d'épargne devient un point d'alerte."
          vertLabel="Seuil vert"
          vertHint="Au-dessus, l'opération s'autofinance."
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
      {/* `max-w-2xl` = la largeur de CETTE page, pas le `max-w-6xl` d'où ce
          composant a été copié (`ApartmentDetail`, dont la page fait 6xl). Sans
          ça le message de confirmation démarrait 240 px à gauche du formulaire
          qu'il confirme. Une bannière suit toujours le conteneur de sa page. */}
      <div className={`mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3 text-xs font-medium sm:px-6 ${s.text}`}>
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
  title,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
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
        <SectionHeader title={title} />
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
      <GroupHeading titre={titre} description={description} />

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

      <ZonesBar valide={valide} rouge={formatValue(rouge)} vert={formatValue(vert)} />
    </section>
  );
}

/** Les trois zones que les deux seuils découpent, nommées. Remplace l'ancien
 *  couple « R 4,0 % / V 5,0 % » : les initiales étaient un code à déchiffrer, et
 *  la barre ne disait pas à quoi servaient ses couleurs. Ici la valeur est posée
 *  SUR la frontière qu'elle définit — c'est le sens même d'un seuil. */
function ZonesBar({ valide, rouge, vert }: { valide: boolean; rouge: string; vert: string }) {
  const zones = [
    { label: "Alerte", text: "text-red-600", bar: "bg-red-400" },
    { label: "À surveiller", text: "text-amber-700", bar: "bg-amber-400" },
    { label: "Objectif", text: "text-emerald-700", bar: "bg-emerald-400" },
  ];
  return (
    <div aria-hidden>
      <div className="flex text-[10px] font-medium uppercase tracking-wide">
        {zones.map((z, i) => (
          <span
            key={z.label}
            className={`flex-1 ${valide ? z.text : "text-ink-400"} ${
              i === 1 ? "text-center" : i === 2 ? "text-right" : ""
            }`}
          >
            {z.label}
          </span>
        ))}
      </div>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full">
        {zones.map((z) => (
          <div key={z.label} className={`flex-1 ${valide ? z.bar : "bg-ink-200"}`} />
        ))}
      </div>
      {/* Positionnées aux tiers, décalées de leur demi-largeur : la valeur est
          centrée sur la frontière de couleur, pas sur une des deux zones. */}
      <div className="relative mt-1.5 h-4 font-mono text-[10px] tabular-nums text-ink-500">
        <span className="absolute left-1/3 -translate-x-1/2">{rouge}</span>
        <span className="absolute left-2/3 -translate-x-1/2">{vert}</span>
      </div>
    </div>
  );
}

/**
 * Sous-titre de groupe + sa phrase d'explication.
 *
 * Le rendu du titre vient de `GroupTitle` (échelle partagée, `text-base`) :
 * ce composant n'ajoute que la description. Sans ça, on aurait de nouveau deux
 * définitions du même niveau — c'est exactement ce qui avait déjà fait diverger
 * le `legend` (`font-medium ink-700`) des `h3` (`semibold ink-800`).
 *
 * Plus d'icône : elle était en `ink-400` devant le titre, alors que le titre de
 * carte au-dessus n'en a plus. Décorer le niveau subordonné plus que son parent
 * inversait la hiérarchie.
 */
function GroupHeading({
  as = "h3",
  titre,
  description,
}: {
  as?: "h3" | "legend";
  titre: string;
  description: string;
}) {
  return (
    <div className="w-full">
      <GroupTitle as={as}>{titre}</GroupTitle>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{description}</p>
    </div>
  );
}
