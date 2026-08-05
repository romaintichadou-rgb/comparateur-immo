"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Calculator, ChevronDown, Plus, X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { TONE_PANEL_STYLES, TONE_TEXT_CLASS, cashflowTone, type CashflowSeuils } from "@/lib/analyse/scoring";
import {
  defaultInputs,
  resolveInputs,
  simulate,
  LMNP,
  REGIMES_FISCAUX,
  REGIME_FISCAL_DEFAUT,
  type RegimeFiscal,
  INDEXATION_CHARGES_DEFAUT_PCT,
  REVALORISATION_BIEN_DEFAUT_PCT,
  REVALORISATION_LOYER_DEFAUT_PCT,
  VACANCE_LOCATIVE_DEFAUT_PCT,
  type AnneeSimulation,
  type SimulationInputs,
} from "@/lib/simulation";
import { AiEstimatedBadge, NumberField, SelectField } from "@/components/form/Fields";
import { GroupTitle, SectionHeader, TITRE_SECTION } from "@/components/SectionHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import Skeleton from "@/components/Skeleton";
import { isAiEstimated } from "@/lib/estimates";
import { formatEurosSigned, formatNombre } from "@/lib/format";

/**
 * Onglet "Simulation financière" : cash-flow mensuel réel en LMNP réel,
 * année par année sur la durée du prêt. Le simulateur de crédit est
 * modifiable ; l'exploitation (loyer, charges, taxe foncière…) vient des
 * données du bien. Se recalcule en direct ; les hypothèses (crédit,
 * revalorisations) sont enregistrées explicitement (bouton dédié) pour que
 * le score de l'Analyse IA reflète ce que l'utilisateur a réellement modélisé.
 */

/** Petit contrôle "+" discret pour activer une hypothèse optionnelle
 * (désactivée par défaut = la plus prudente), avec une valeur de repli au clic. */
/** Pastille d'origine d'une valeur (accent, discrète), à côté du libellé. */
function Pastille({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-accent-50 px-1.5 py-0.5 text-[10px] font-medium text-accent-600">
      {children}
    </span>
  );
}

/**
 * Champ HÉRITÉ du Profil investisseur, avec surcharge possible sur ce bien.
 *
 * Miroir d'`OptionalRateField`, sens inversé : là où une hypothèse optionnelle
 * est absente par défaut et s'active, celle-ci a TOUJOURS une valeur (celle du
 * profil) et c'est la surcharge qui s'active.
 *
 * **Toujours un champ de saisie, jamais un encart en lecture seule.** Le mode
 * hérité affichait auparavant la valeur derrière un second bouton « Modifier »,
 * pour éviter de laisser croire que le chiffre était stocké sur le bien. Mais
 * depuis que le panneau a son propre mode édition, ça faisait DEUX portes à
 * franchir pour taper un chiffre — on avait déjà cliqué « Modifier » sur le
 * panneau. L'origine de la valeur reste dite par la pastille « profil », comme
 * le fait déjà le montant emprunté avec sa pastille « auto », lui aussi dérivé
 * ET directement éditable.
 */
function ChampHerite({
  label,
  suffix,
  override,
  resolu,
  onChange,
}: {
  label: string;
  suffix: string;
  /** Valeur propre au bien. `null` = héritée. */
  override: number | null;
  /** Valeur effectivement utilisée par le calcul (profil ou surcharge). */
  resolu: number;
  onChange: (v: number | null) => void;
}) {
  const herite = override == null;
  return (
    <div className="flex items-end gap-1">
      <div className="min-w-0 flex-1">
        <NumberField
          // Force le réamorçage du texte affiché quand on repasse en hérité :
          // sans ça, vider une surcharge laissait le champ vide au lieu de
          // réafficher la valeur du profil qui reprend effet.
          key={herite ? "herite" : "override"}
          label={label}
          value={herite ? resolu : override}
          // `v` passe tel quel : vider le champ renvoie `null`, donc retour au
          // profil. L'ancien `v ?? 0` transformait un champ vidé en 0 — sur la
          // durée, `Math.max(1, …)` le ramenait à 1 an sans que rien ne le dise.
          onChange={onChange}
          suffix={suffix}
          hint={herite ? <Pastille>profil</Pastille> : undefined}
        />
      </div>
      {/* Emplacement réservé même sans bouton : sinon les champs surchargés
          sont plus étroits que les autres et la colonne devient irrégulière. */}
      <div className="mb-[3px] w-11 shrink-0 flex justify-center">
        {!herite && (
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Revenir à la valeur du profil investisseur"
            aria-label={`${label} : revenir au profil`}
            className="flex h-11 w-11 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Intitulé d'un groupe d'hypothèses (Crédit / Fiscalité / Projection). */
function HypGroupTitle({ children }: { children: ReactNode }) {
  return <GroupTitle className="mb-1">{children}</GroupTitle>;
}

/**
 * Ligne d'hypothèse en lecture. Dense, discrète : c'est une donnée d'ENTRÉE, on
 * la consulte pour vérifier sur quoi la simulation repose, pas pour la lire
 * comme un résultat.
 *
 * La pastille est collée à la VALEUR, à droite, et non après le libellé : quand
 * elle suivait le libellé (« Montant emprunté [auto · hors notaire] 219 000 € »)
 * elle poussait le montant hors de la ligne, qui passait à deux lignes et
 * cassait l'alignement de la colonne.
 */
function HypRow({ label, value, badge }: { label: string; value: string; badge?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[3px]">
      <span className="truncate text-[11px] text-ink-500">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {badge}
        <span className="text-xs tabular-nums text-ink-800">{value}</span>
      </span>
    </div>
  );
}

function FinSectionTitle({ children }: { children: ReactNode }) {
  return <GroupTitle className="mb-2">{children}</GroupTitle>;
}

function FinRow({ label, value, badge, suffix }: { label: string; value: string; badge?: ReactNode; suffix?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 text-[13px]">
      <span className="text-ink-500">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5">
        {badge}
        <span className="font-medium tabular-nums text-ink-800">{value}</span>
        {suffix && <span className="text-[10px] text-ink-400">{suffix}</span>}
      </span>
    </div>
  );
}

/** Hypothèse optionnelle en lecture : « — » quand elle est désactivée.
 *  (`pct` est déjà pris plus bas par le calcul de part d'un total.) */
function hypPct(v: number | null): string {
  return v == null ? "—" : `${formatNombre(v)} %`;
}


function OptionalRateField({
  label,
  value,
  defaut,
  onChange,
  suffix = "%/an",
}: {
  label: string;
  value: number | null;
  defaut: number;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  if (value == null) {
    return (
      <button
        type="button"
        onClick={() => onChange(defaut)}
        className="inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2.5 py-2 text-xs font-medium text-ink-400 transition-colors hover:border-ink-400 hover:text-ink-600"
      >
        <Plus className="h-3 w-3" />
        {label}
      </button>
    );
  }
  return (
    <div className="flex items-end gap-1">
      <NumberField
        label={label}
        value={value}
        onChange={(v) => {
          if (v != null && v <= 0) return;
          onChange(v ?? 0);
        }}
        suffix={suffix}
      />
      <button
        type="button"
        onClick={() => onChange(null)}
        title="Désactiver cette hypothèse"
        aria-label={`Désactiver ${label}`}
        className="mb-[3px] flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const TMI_OPTIONS = ["11", "30", "41", "45"] as const;

/** Dérivé de `REGIMES_FISCAUX` : ajouter un régime là-bas suffit à le proposer. */
const REGIMES_FISCAUX_OPTIONS = Object.keys(REGIMES_FISCAUX) as RegimeFiscal[];

// Seuils personnels (page Paramètres) : au-dessus du seuil vert c'est "GO",
// en dessous du seuil rouge c'est un point d'alerte, entre les deux c'est
// acceptable. Le type et la logique de tonalité viennent de scoring.ts —
// source unique, pour que le même cash-flow soit peint pareil partout.
function cashflowTextClass(monthly: number, seuils: CashflowSeuils): string {
  return TONE_TEXT_CLASS[cashflowTone(monthly, seuils)];
}

export default function SimulationFinanciere({
  apartment,
  settings,
  onSaved,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
  /** Appelé après l'enregistrement, pour resynchroniser le bien côté parent.
   *  Reçoit le bien complet renvoyé par l'unique PATCH de l'onglet. */
  onSaved?: (apartment: ApartmentWithComputed) => void;
}) {
  const cashflowSeuils: CashflowSeuils = {
    vert: settings.cashflowSeuilVertEuros,
    rouge: settings.cashflowSeuilRougeEuros,
  };

  // `simulation_inputs` (persisté) est la source de vérité utilisée par le
  // score de l'Analyse IA. `inputs` est l'état local édité en direct ; il se
  // resynchronise dès que la valeur enregistrée change (après un save, ou si
  // le bien affiché change), via le pattern "ajuster l'état pendant le rendu"
  // déjà utilisé dans NumberField.
  const [savedInputs, setSavedInputs] = useState(apartment.simulation_inputs);
  const [inputs, setInputs] = useState<SimulationInputs>(() => apartment.simulation_inputs ?? defaultInputs());
  if (apartment.simulation_inputs !== savedInputs) {
    setSavedInputs(apartment.simulation_inputs);
    setInputs(apartment.simulation_inputs ?? defaultInputs());
  }
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(inputs) !== JSON.stringify(savedInputs ?? defaultInputs());

  // UNE carte en édition à la fois. `snapshot` est la copie d'avant-édition qui
  // rend « Annuler » possible — il n'existait pas : on éditait en direct et le
  // seul retour en arrière était de retaper les valeurs de mémoire.
  const [editingId, setEditingId] = useState<null | "hypotheses">(null);
  const [snapshot, setSnapshot] = useState<SimulationInputs | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hypOpen, setHypOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(true);

  // La quote-part terrain vit sur le BIEN, pas dans `simulation_inputs` : elle
  // partait donc en PATCH immédiat, un deuxième modèle d'enregistrement dans le
  // même écran (et impossible à annuler). On la tient en brouillon local le
  // temps de l'édition, et elle part avec le reste au clic sur Enregistrer.
  // `null` = pas de brouillon actif ; `{value: null}` = brouillon « auto ».
  const [quotePartDraft, setQuotePartDraft] = useState<{ value: number | null } | null>(null);

  // `inputs` = ce qui est STOCKÉ sur le bien (profil emprunteur en `null` tant
  // qu'il n'est pas surchargé). `resolus` = ce que la simulation consomme, une
  // fois l'héritage du Profil investisseur appliqué. Les champs lisent `resolus`
  // pour AFFICHER, et écrivent dans `inputs` pour créer un override.
  const resolus = useMemo(() => resolveInputs(inputs, settings), [inputs, settings]);
  // Le brouillon de quote-part alimente la simulation pour que l'aperçu reste
  // vivant pendant l'édition, sans rien persister tant qu'on n'a pas enregistré.
  const apartmentSim = useMemo(
    () =>
      quotePartDraft ? { ...apartment, quote_part_terrain_pct: quotePartDraft.value } : apartment,
    [apartment, quotePartDraft],
  );
  const result = useMemo(() => simulate(apartmentSim, resolus), [apartmentSim, resolus]);
  const surchargesHyp = (inputs.regimeFiscal != null && inputs.regimeFiscal !== REGIME_FISCAL_DEFAUT ? 1 : 0)
    + (inputs.tmiPct != null ? 1 : 0)
    + (apartment.quote_part_terrain_pct != null ? 1 : 0)
    + (inputs.revalorisationBienPct != null ? 1 : 0)
    + (inputs.revalorisationLoyerPct != null ? 1 : 0)
    + (inputs.indexationChargesPct != null ? 1 : 0)
    + (inputs.vacanceLocativePct != null ? 1 : 0);

  function set<K extends keyof SimulationInputs>(key: K, value: SimulationInputs[K]) {
    setInputs((i) => ({ ...i, [key]: value }));
  }

  function startEdit() {
    setSnapshot(inputs);
    setQuotePartDraft({ value: apartment.quote_part_terrain_pct ?? null });
    setEditingId("hypotheses");
    setHypOpen(true);
  }

  function cancelEdit() {
    if (snapshot) setInputs(snapshot);
    setQuotePartDraft(null);
    setSnapshot(null);
    setEditingId(null);
  }

  async function saveEdit() {
    // La quote-part part dans le MÊME PATCH que les hypothèses. Deux requêtes
    // enchaînées laissaient une fenêtre incohérente : le second appel repartait
    // de l'`apartment` capturé au rendu précédent et réécrasait localement les
    // `simulation_inputs` qu'on venait d'enregistrer, jusqu'à ce que la réponse
    // serveur remette tout d'aplomb.
    await persist(
      inputs,
      quotePartDraft && quotePartDraft.value !== (apartment.quote_part_terrain_pct ?? null)
        ? { quote_part_terrain_pct: quotePartDraft.value }
        : undefined,
    );
    setQuotePartDraft(null);
    setSnapshot(null);
    setEditingId(null);
  }

  /** Point d'enregistrement UNIQUE de l'onglet : un PATCH, une réponse, un
   *  `onSaved`. La quote-part terrain passait auparavant par un chemin séparé
   *  (PATCH immédiat à chaque frappe, sans annulation possible).
   *
   *  `payload` est passé EXPLICITEMENT et non lu dans l'état : la réinitialisation
   *  appelle `setInputs` puis `persist` dans la foulée, et l'état ne serait pas
   *  encore à jour au moment de construire le corps de la requête. */
  async function persist(
    payload: SimulationInputs,
    extra?: { quote_part_terrain_pct: number | null },
  ) {
    setSaving(true);
    try {
      const res = await fetch(`/api/apartments/${apartment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulation_inputs: payload, ...extra }),
      });
      if (res.ok) {
        const { apartment: updated } = await res.json();
        onSaved?.(updated);
      }
    } finally {
      setSaving(false);
    }
  }

  const handleSaveInputs = () => persist(inputs);

  async function resetHypotheses() {
    const patched: SimulationInputs = {
      ...inputs,
      regimeFiscal: null,
      tmiPct: null,
      revalorisationBienPct: null,
      revalorisationLoyerPct: null,
      indexationChargesPct: null,
      vacanceLocativePct: null,
    };
    setInputs(patched);
    setQuotePartDraft(null);
    setSnapshot(null);
    setEditingId(null);
    setConfirmReset(false);
    await persist(patched, { quote_part_terrain_pct: null });
  }

  if (!result) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-10 text-center">
        <Calculator className="mx-auto h-8 w-8 text-ink-300" />
        <h2 className="mt-3 font-display text-lg font-semibold text-ink-900">Simulation financière</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
          Renseigne d&apos;abord un loyer et un prix dans l&apos;onglet « Description de
          l&apos;appartement » pour simuler le cash-flow.
        </p>
      </div>
    );
  }

  const cfLMNP = result.cashflowMensuelMoyenLMNP;
  const cfAn1 = result.cashflowMensuelAn1;

  // Moyennes mensuelles sur les années exonérées LMNP (année 1 toujours incluse).
  const exoAnnees = result.annees.filter((a) => a.impot < 1);
  const lmnpAnnees = exoAnnees.length > 0
    ? (exoAnnees[0].annee === 1 ? exoAnnees : [result.annees[0], ...exoAnnees])
    : [result.annees[0]];
  const nLmnp = lmnpAnnees.length;
  const avgM = (f: (a: AnneeSimulation) => number) =>
    lmnpAnnees.reduce((s, a) => s + f(a), 0) / nLmnp / 12;
  const loyerMoyenM = avgM((a) => a.loyers);
  const chargesMoyennesM = avgM((a) => a.chargesExploitation);
  const impotMoyenM = avgM((a) => a.impot);
  const cfTone = TONE_PANEL_STYLES[cashflowTone(cfLMNP, cashflowSeuils)];

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser les hypothèses ?"
        description="La fiscalité suivra de nouveau ton Profil investisseur, la quote-part terrain repassera en calcul automatique, et les revalorisations, indexation et vacance seront désactivées."
        confirmLabel="Réinitialiser"
        loadingLabel="Réinitialisation…"
        destructive
        loading={saving}
        onConfirm={resetHypotheses}
        onCancel={() => setConfirmReset(false)}
      />

      {/* Hypothèses — Fiscalité + Projection, séparées du financement */}
      <section className={`overflow-hidden rounded-xl border bg-white transition-colors ${editingId === "hypotheses" ? "border-accent-300" : "border-ink-100"}`}>
        <button
          type="button"
          onClick={() => !editingId && setHypOpen((o) => !o)}
          className="flex w-full flex-col gap-3 p-5 text-left"
        >
          <div className="flex items-center justify-between">
            <span className={TITRE_SECTION}>Hypothèses</span>
            <ChevronDown
              className={`h-4 w-4 text-ink-400 transition-transform ${hypOpen ? "rotate-180" : ""}`}
            />
          </div>

          {/* Summary pills — toujours visibles, cliquable */}
          <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            {REGIMES_FISCAUX[resolus.regimeFiscal]}
          </span>
          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            TMI {formatNombre(resolus.tmiPct)} %
          </span>
          {inputs.revalorisationLoyerPct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Revalo loyer {formatNombre(inputs.revalorisationLoyerPct)} %/an
            </span>
          )}
          {inputs.vacanceLocativePct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Vacance {formatNombre(inputs.vacanceLocativePct)} %
            </span>
          )}
          </div>
        </button>

        {hypOpen && (
          <div className="px-5 pb-5">
            <div className="border-t border-ink-100/50 pt-1">
              {editingId === "hypotheses" ? (
                <>
                  <div className="grid grid-cols-1 gap-x-32 gap-y-5 py-4 sm:grid-cols-2">
                    <div className="space-y-3">
                      <HypGroupTitle>Fiscalité</HypGroupTitle>
                      <SelectField
                        label="Régime fiscal"
                        value={resolus.regimeFiscal}
                        onChange={(v) => set("regimeFiscal", v)}
                        options={REGIMES_FISCAUX_OPTIONS}
                        optionLabel={(v) => REGIMES_FISCAUX[v]}
                        allowEmpty={false}
                      />
                      <div className="flex items-end gap-1">
                        <div className="min-w-0 flex-1">
                          <SelectField
                            label="Tranche marginale d'imposition (TMI)"
                            value={String(resolus.tmiPct) as (typeof TMI_OPTIONS)[number]}
                            onChange={(v) => set("tmiPct", Number(v))}
                            options={TMI_OPTIONS}
                            allowEmpty={false}
                            hint={
                              inputs.tmiPct == null ? undefined : (
                                <span className="text-xs font-normal text-ink-400">
                                  + {LMNP.prelevementsSociauxPct} % PS
                                </span>
                              )
                            }
                          />
                        </div>
                        <div className="mb-[3px] w-11 shrink-0 flex justify-center">
                          {inputs.tmiPct != null && (
                            <button
                              type="button"
                              onClick={() => set("tmiPct", null)}
                              title="Revenir à la valeur du profil investisseur"
                              aria-label="TMI : revenir au profil"
                              className="flex h-11 w-11 items-center justify-center rounded-md text-ink-300 transition-colors hover:bg-ink-100 hover:text-ink-600"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <NumberField
                        label="Quote-part terrain"
                        value={result.quotePartTerrainPct}
                        onChange={(v) => setQuotePartDraft({ value: v })}
                        suffix="% du prix"
                      />
                    </div>

                    <div className="space-y-3">
                      <HypGroupTitle>Projection</HypGroupTitle>
                      <div className="space-y-3">
                        <OptionalRateField
                          label="Revalorisation du bien"
                          value={inputs.revalorisationBienPct}
                          defaut={REVALORISATION_BIEN_DEFAUT_PCT}
                          onChange={(v) => set("revalorisationBienPct", v)}
                        />
                        <OptionalRateField
                          label="Revalorisation du loyer"
                          value={inputs.revalorisationLoyerPct}
                          defaut={REVALORISATION_LOYER_DEFAUT_PCT}
                          onChange={(v) => set("revalorisationLoyerPct", v)}
                        />
                        <OptionalRateField
                          label="Indexation charges"
                          value={inputs.indexationChargesPct}
                          defaut={INDEXATION_CHARGES_DEFAUT_PCT}
                          onChange={(v) => set("indexationChargesPct", v)}
                        />
                        <OptionalRateField
                          label="Vacance locative"
                          value={inputs.vacanceLocativePct}
                          defaut={VACANCE_LOCATIVE_DEFAUT_PCT}
                          onChange={(v) => set("vacanceLocativePct", v)}
                          suffix="% du loyer"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 border-t border-ink-100/50 pt-3">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:bg-ink-50"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      disabled={saving}
                      className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-x-32 py-3.5 sm:grid-cols-2">
                    <div>
                      <FinSectionTitle>Fiscalité</FinSectionTitle>
                      <FinRow label="Régime fiscal" value={REGIMES_FISCAUX[resolus.regimeFiscal]} />
                      <FinRow
                        label="TMI"
                        value={`${formatNombre(resolus.tmiPct)} %`}
                        suffix={`+ ${formatNombre(LMNP.prelevementsSociauxPct)} % PS`}
                      />
                      <FinRow
                        label="Quote-part terrain"
                        value={`${formatNombre(result.quotePartTerrainPct)} %`}
                      />
                    </div>
                    <div>
                      <FinSectionTitle>Projection</FinSectionTitle>
                      <FinRow label="Revalorisation du bien" value={hypPct(inputs.revalorisationBienPct)} />
                      <FinRow label="Revalorisation du loyer" value={hypPct(inputs.revalorisationLoyerPct)} />
                      <FinRow label="Indexation charges" value={hypPct(inputs.indexationChargesPct)} />
                      <FinRow label="Vacance locative" value={hypPct(inputs.vacanceLocativePct)} />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-3 py-3.5">
                    {surchargesHyp > 0 && (
                      <button
                        type="button"
                        onClick={() => setConfirmReset(true)}
                        className="min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium text-ink-400 underline underline-offset-2 transition-colors hover:bg-ink-50 hover:text-ink-600"
                      >
                        Réinitialiser
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit()}
                      disabled={editingId !== null}
                      className="rounded-lg border border-accent-300 bg-white px-5 py-2 text-[13px] font-medium text-accent-600 transition-colors hover:border-accent-600 hover:bg-accent-50 disabled:opacity-50"
                    >
                      Modifier
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* `editingId === null` : quand une carte est en édition, c'est SON pied
          qui porte Enregistrer. Laisser la bannière en plus afficherait deux
          boutons pour la même action, à deux endroits de l'écran. La bannière
          reste indispensable pour les hypothèses du tableau année par année,
          qui s'éditent en ligne sans passer par une carte. */}
      {dirty && editingId === null && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-accent-50 px-4 py-2.5">
          <p className="text-xs text-accent-700">
            Hypothèses modifiées, non enregistrées — le score de l&apos;Analyse IA se base sur les
            dernières hypothèses enregistrées.
          </p>
          <button
            onClick={handleSaveInputs}
            disabled={saving}
            className="shrink-0 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer les hypothèses"}
          </button>
        </div>
      )}

      {/* Cash-flow mensuel détaillé */}
      <section id="sim-cashflow" className="scroll-mt-24 space-y-4 rounded-xl border border-ink-100 bg-white p-5">
        <SectionHeader title="Cash-flow mensuel" as="h3" />
        <ul className="divide-y divide-ink-100/50 text-sm">
          <WaterfallRow
            label="Loyers encaissés"
            value={loyerMoyenM}
            plus
            badge={isAiEstimated(apartment, "loyer_retenu") && <AiEstimatedBadge />}
          />
          <WaterfallRow label="Mensualité de crédit" value={-result.mensualiteTotale} />
          <WaterfallRow label="Charges d'exploitation" value={-chargesMoyennesM} />
          <WaterfallRow label="Impôt LMNP (moyen)" value={-impotMoyenM} />
        </ul>
        <div className={`rounded-xl p-4 ${cfTone.wrap}`}>
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <span className={`text-sm font-semibold ${cfTone.label}`}>Cash-flow mensuel</span>
              <p className={`mt-0.5 text-xs ${cfTone.sub}`}>
                {result.anneesExonerees > 1
                  ? `Moyen sur ${result.anneesExonerees} ans sans impôt`
                  : result.anneesExonerees === 1
                    ? "Année 1, sans impôt"
                    : "Année 1, après impôt"}
              </p>
            </div>
            <span className={`font-mono text-2xl font-bold tabular-nums ${cfTone.value}`}>
              {formatEurosSigned(cfLMNP)}
            </span>
          </div>
          <div className="mt-3 rounded-lg bg-white px-3 py-2.5 text-xs leading-relaxed text-ink-500">
            {result.annees[0].impot === 0 ? (<>
              <strong className="font-semibold text-ink-700">Pourquoi 0 € d'impôt ?</strong>{" "}
              En LMNP au réel, tu déduis l'usure du bien (amortissements) de tes revenus locatifs.
              Ici, <strong className="font-medium text-ink-700">
                {euros(result.amortissements.bati + result.amortissements.travaux + result.amortissements.notaire)} €/an
              </strong> d'amortissements{" "}
              (bâti {euros(result.amortissements.bati)} €
              {result.amortissements.travaux > 0 ? ` + travaux ${euros(result.amortissements.travaux)} €` : ""}
              {result.amortissements.notaire > 0 ? ` + notaire ${euros(result.amortissements.notaire)} €` : ""})
              {" "}absorbent tes revenus nets → résultat imposable = 0 € pendant <strong className="font-medium text-ink-700">{result.anneesExonerees} {result.anneesExonerees > 1 ? "ans" : "an"}</strong>.
            </>) : (<>
              <strong className="font-semibold text-ink-700">Impôt année 1 : {euros(result.annees[0].impot)} €</strong>{" "}
              Les amortissements LMNP (<strong className="font-medium text-ink-700">
                {euros(result.amortissements.bati + result.amortissements.travaux + result.amortissements.notaire)} €/an
              </strong>) réduisent tes revenus imposables à {euros(result.annees[0].resultatImposable)} €/an.
            </>)}
          </div>
        </div>
      </section>

      {/* Graphiques (remontés avant le tableau) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="min-w-0 space-y-3 rounded-xl border border-ink-100 bg-white p-5">
          <SectionHeader title="Financement du projet" as="h3" />
          <p className="text-xs text-ink-400">
            {`D'où vient l'argent qui couvre le coût total de l'opération sur ${resolus.dureeAnnees} ans : les loyers collectés, une économie fiscale éventuelle, et la part de l'apport encore non « remboursée » par le cash-flow au terme.`}
          </p>
          <FinancementDonut financement={result.financementProjet} />
        </section>

        <section className="min-w-0 space-y-4 rounded-xl border border-ink-100 bg-white p-5">
          <SectionHeader title="Évolution du patrimoine" as="h3" />
          <p className="text-xs text-ink-400">
            Chaque année : la dette restante (ce qui reste dû à la banque), l&apos;enrichissement net
            (valeur du bien au-delà de la dette et de l&apos;apport non récupéré), et l&apos;effort
            d&apos;épargne encore porté (apport pas encore compensé par le cash-flow cumulé).{" "}
            {inputs.revalorisationBienPct != null
              ? `Hypothèse de revalorisation du bien : ${inputs.revalorisationBienPct} %/an`
              : "Aucune revalorisation du bien supposée"}{" "}
            — hors fiscalité de la plus-value à la revente.
          </p>
          <PatrimoineChart annees={result.annees} />
        </section>
      </div>

      {/* Tableau année par année — collapsible */}
      <section className="overflow-hidden rounded-xl border border-ink-100 bg-white">
        <button
          type="button"
          onClick={() => setTableOpen((o) => !o)}
          className="flex w-full items-center justify-between px-5 py-3"
        >
          <span className={TITRE_SECTION}>Cash-flow année par année</span>
          <ChevronDown
            className={`h-4 w-4 text-ink-400 transition-transform ${tableOpen ? "rotate-180" : ""}`}
          />
        </button>
        {tableOpen && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y border-ink-100 bg-ink-50 text-left text-xs uppercase tracking-wide text-ink-400">
                    <th className="px-2 py-2 font-medium sm:px-5">Année</th>
                    <th className="px-1.5 py-2 text-right font-medium sm:px-3">Loyers</th>
                    <th className="px-1.5 py-2 text-right font-medium sm:px-3">Crédit</th>
                    <th className="px-1.5 py-2 text-right font-medium sm:px-3">Charges</th>
                    <th className="px-1.5 py-2 text-right font-medium sm:px-3">Impôt</th>
                    <th className="px-1.5 py-2 text-right font-medium sm:px-3">CF /an</th>
                    <th className="px-2 py-2 text-right font-medium sm:px-5">/mois</th>
                  </tr>
                </thead>
                {/* Chiffres en IBM Plex Sans, pas en Geist Mono : ce sont des
                    lignes de détail. L'alignement des colonnes n'en souffre pas —
                    IBM Plex Sans a des chiffres tabulaires natifs (mesuré :
                    « 1111 » et « 0000 » à la même largeur au pixel). */}
                <tbody className="divide-y divide-ink-50 tabular-nums">
                  {result.annees.map((a) => (
                    <tr key={a.annee} className="hover:bg-ink-50/60">
                      <td className="px-2 py-1.5 text-ink-500 sm:px-5">{a.annee}</td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">{euros(a.loyers)}</td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">
                        {euros(-(result.mensualiteTotale * 12))}
                      </td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">{euros(-a.chargesExploitation)}</td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">{euros(-a.impot)}</td>
                      <td className={`px-1.5 py-1.5 text-right font-medium sm:px-3 ${cashflowTextClass(a.cashflowMensuel, cashflowSeuils)}`}>
                        {signe(a.cashflowAnnuel)}
                      </td>
                      <td className={`px-2 py-1.5 text-right font-semibold sm:px-5 ${cashflowTextClass(a.cashflowMensuel, cashflowSeuils)}`}>
                        {signe(a.cashflowMensuel)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-xs text-ink-400">
              Total impôts sur {resolus.dureeAnnees} ans : {euros(result.totalImpots)} € · loyer{" "}
              {inputs.revalorisationLoyerPct != null
                ? `revalorisé à ${inputs.revalorisationLoyerPct} %/an`
                : "supposé constant (pas de revalorisation)"}{" "}
              ; charges de copropriété et taxe foncière{" "}
              {inputs.indexationChargesPct != null
                ? `indexées à ${inputs.indexationChargesPct} %/an`
                : "supposées constantes (pas d'indexation)"}
              {inputs.vacanceLocativePct != null
                ? ` ; vacance locative ${inputs.vacanceLocativePct} %`
                : ""}
              .
            </p>
          </div>
        )}
      </section>

      {/* Sticky bar pendant l'édition — feedback temps réel du cash-flow */}
      {editingId !== null && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-100 bg-white/95 px-4 py-2.5 backdrop-blur-sm">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <span className="text-xs text-ink-500">Cash-flow mensuel</span>
            <span className={`font-mono text-lg font-bold tabular-nums ${cashflowTextClass(cfLMNP, cashflowSeuils)}`}>
              {formatEurosSigned(cfLMNP)}<span className="ml-0.5 text-xs font-normal text-ink-400">/mois</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

const FINANCEMENT_COLORS = { loyers: "#3d3580", economieFiscale: "#b3a9e8", participation: "#f59e0b" };

interface TooltipState {
  x: number;
  y: number;
  content: ReactNode;
}

/** Tooltip sombre positionnée au-dessus du curseur, dans un conteneur `relative`. */
function ChartTooltip({ tooltip }: { tooltip: TooltipState }) {
  return (
    <div
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-900 px-3 py-2 text-xs text-white shadow-lg"
      style={{ left: tooltip.x, top: tooltip.y - 10 }}
    >
      {tooltip.content}
    </div>
  );
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-ink-300">{label}</span>
      <span className="ml-auto font-semibold text-white">{value}</span>
    </div>
  );
}

function FinancementDonut({
  financement,
}: {
  financement: { loyers: number; economieFiscale: number; participation: number; total: number };
}) {
  const { loyers, economieFiscale, participation, total } = financement;
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  if (total <= 0) {
    return <p className="text-sm text-ink-400">Données insuffisantes pour ce calcul.</p>;
  }

  const segments = [
    { key: "loyers", label: "Loyers", value: loyers, color: FINANCEMENT_COLORS.loyers },
    { key: "economieFiscale", label: "Économie fiscale", value: economieFiscale, color: FINANCEMENT_COLORS.economieFiscale },
    { key: "participation", label: "Participation", value: participation, color: FINANCEMENT_COLORS.participation },
  ];

  const size = 140;
  const stroke = 24;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Géométrie de chaque segment précalculée une fois : position de départ sur
  // la circonférence (pour le dessin de l'arc) et angle médian (pour placer le
  // pourcentage au centre de l'arc, toujours visible sans survol).
  let cursor = 0;
  const geoSegments = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = s.value / total;
      const dash = frac * c;
      const start = cursor;
      cursor += dash;
      const angle = ((start + dash / 2) / c) * 2 * Math.PI;
      return { ...s, frac, dash, start, angle };
    });

  function showTooltip(e: MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: (
        <div className="space-y-1">
          {segments.map((s) => (
            <TooltipRow key={s.key} color={s.color} label={s.label} value={`${euros(s.value)} € (${pct(s.value, total)} %)`} />
          ))}
        </div>
      ),
    });
  }

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-4">
      {tooltip && <ChartTooltip tooltip={tooltip} />}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          className="-rotate-90 cursor-default"
          onMouseMove={showTooltip}
          onMouseLeave={() => setTooltip(null)}
        >
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e6e1f0" strokeWidth={stroke} />
          {geoSegments.map((s) => (
            <circle
              key={s.key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${s.dash} ${c - s.dash}`}
              strokeDashoffset={-s.start}
            />
          ))}
          {geoSegments
            .filter((s) => s.frac >= 0.06)
            .map((s) => {
              const lx = size / 2 + r * Math.cos(s.angle);
              const ly = size / 2 + r * Math.sin(s.angle);
              return (
                <g key={`pct-${s.key}`} transform={`rotate(90 ${lx} ${ly})`}>
                  <text
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={12}
                    fontWeight={700}
                    fill="#ffffff"
                    stroke="rgba(0,0,0,0.35)"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {pct(s.value, total)}%
                  </text>
                </g>
              );
            })}
        </svg>
      </div>
      <ul className="w-full max-w-[220px] space-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-ink-600">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
            <span className="whitespace-nowrap font-medium text-ink-800">
              {euros(s.value)} € <span className="text-ink-400">({pct(s.value, total)} %)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PATRIMOINE_COLORS = { dette: "#c9c2d9", enrichissement: "#10b981", effortEpargne: "#3d3580" };

function PatrimoineChart({ annees }: { annees: AnneeSimulation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const maxTotal = Math.max(
    1,
    ...annees.map((a) => a.capitalRestantDu + a.enrichissement + a.effortEpargne)
  );
  const barWidth = 22;
  const gap = 10;
  const chartHeight = 220;
  const width = annees.length * (barWidth + gap) + gap;

  const scale = (v: number) => (v / maxTotal) * chartHeight;

  function showTooltip(e: MouseEvent, a: AnneeSimulation) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      content: (
        <div className="space-y-1">
          <p className="mb-1 font-semibold text-white">Année {a.annee}</p>
          <TooltipRow color={PATRIMOINE_COLORS.dette} label="Dette restante" value={`${euros(a.capitalRestantDu)} €`} />
          <TooltipRow color={PATRIMOINE_COLORS.enrichissement} label="Enrichissement" value={`${euros(a.enrichissement)} €`} />
          <TooltipRow color={PATRIMOINE_COLORS.effortEpargne} label="Effort d'épargne" value={`${euros(a.effortEpargne)} €`} />
        </div>
      ),
    });
  }

  return (
    <div ref={containerRef} className="relative">
      {tooltip && <ChartTooltip tooltip={tooltip} />}
      <svg
        viewBox={`0 0 ${width} ${chartHeight + 30}`}
        preserveAspectRatio="none"
        width="100%"
        height={chartHeight + 30}
        className="block"
      >
        {annees.map((a, i) => {
          const x = gap + i * (barWidth + gap);
          const hDette = scale(a.capitalRestantDu);
          const hEnrichissement = scale(a.enrichissement);
          const hEffort = scale(a.effortEpargne);
          let y = chartHeight;
          const rects: { y: number; h: number; color: string }[] = [];
          y -= hDette;
          rects.push({ y, h: hDette, color: PATRIMOINE_COLORS.dette });
          y -= hEnrichissement;
          rects.push({ y, h: hEnrichissement, color: PATRIMOINE_COLORS.enrichissement });
          y -= hEffort;
          rects.push({ y, h: hEffort, color: PATRIMOINE_COLORS.effortEpargne });

          const showLabel = annees.length <= 15 || i % Math.ceil(annees.length / 15) === 0;

          return (
            <g
              key={a.annee}
              className="cursor-default"
              onMouseMove={(e) => showTooltip(e, a)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Zone de survol pleine hauteur : plus facile à cibler que les seuls segments visibles. */}
              <rect x={x} y={0} width={barWidth} height={chartHeight} fill="transparent" />
              {rects.map(
                (r, ri) =>
                  r.h > 0.5 && (
                    <rect key={ri} x={x} y={r.y} width={barWidth} height={r.h} fill={r.color} rx={1} />
                  )
              )}
              {showLabel && (
                <text x={x + barWidth / 2} y={chartHeight + 16} textAnchor="middle" fontSize={10} fill="#8b8393">
                  {a.annee}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink-500">
        <LegendDot color={PATRIMOINE_COLORS.dette} label="Dette restante" />
        <LegendDot color={PATRIMOINE_COLORS.enrichissement} label="Enrichissement" />
        <LegendDot color={PATRIMOINE_COLORS.effortEpargne} label="Effort d'épargne" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function pct(value: number, total: number): string {
  return total > 0 ? Math.round((value / total) * 100).toString() : "0";
}

export function ResultCard({
  label,
  sub,
  value,
  tone,
  emphase = false,
  loading = false,
  onClick,
}: {
  label: string;
  sub: string;
  value: string;
  tone: "neutral" | "positif" | "attention" | "alerte";
  emphase?: boolean;
  /** Valeur en cours de recalcul en arrière-plan → barre skeleton, tuile non cliquable. */
  loading?: boolean;
  onClick?: () => void;
}) {
  const valueTones = TONE_PANEL_STYLES;

  const emphaseBg = {
    neutral: "border-ink-300 bg-ink-100/70",
    positif: "border-emerald-300 bg-emerald-100/70",
    attention: "border-amber-300 bg-amber-100/70",
    alerte: "border-red-300 bg-red-100/70",
  } as const;
  const hoverEmphase = {
    neutral: "hover:border-ink-500",
    positif: "hover:border-emerald-500",
    attention: "hover:border-amber-500",
    alerte: "hover:border-red-500",
  } as const;
  const base = emphase ? emphaseBg[tone] : "border-ink-100 bg-white";
  const hover = emphase ? hoverEmphase[tone] : "hover:border-ink-400";

  const content = (
    <>
      <p className="text-xs font-medium text-ink-500">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 mb-1 h-6 w-24" />
      ) : (
        <p className={`mt-1 font-mono text-2xl font-semibold ${valueTones[tone].value}`}>{value}</p>
      )}
      <p className="mt-0.5 text-[11px] text-ink-400">{sub}</p>
    </>
  );
  const cardClass = `rounded-xl border p-5 ${base}`;

  if (onClick && !loading) {
    return (
      <button
        type="button"
        onClick={onClick}
        title="Voir le détail du calcul"
        className={`w-full text-left transition-colors ${cardClass} ${hover}`}
      >
        {content}
      </button>
    );
  }

  return <div className={cardClass}>{content}</div>;
}

function WaterfallRow({
  label,
  value,
  plus = false,
  badge,
}: {
  label: string;
  value: number;
  plus?: boolean;
  badge?: ReactNode;
}) {
  return (
    <li className="flex items-center justify-between py-2">
      <span className="flex items-center gap-1.5 text-ink-600">
        <span className="mr-1.5 inline-block w-3 text-center font-semibold text-ink-400">{plus ? "+" : "−"}</span>
        {label}
        {badge}
      </span>
      <span className="font-medium text-ink-800">{euros(Math.abs(value))} €</span>
    </li>
  );
}


/** Montant compact sans « € », NON signé pour les positifs. Rend les négatifs
 * avec le vrai signe moins (U+2212) : `toLocaleString` seul poserait un trait
 * d'union, et les colonnes Crédit/Charges/Impôt se retrouvaient avec un glyphe
 * différent des colonnes CF (`signe()`) SUR LA MÊME LIGNE de tableau. */
function euros(n: number): string {
  const r = Math.round(n) || 0; // normalise -0 → 0
  return `${r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("fr-FR")}`;
}

/** Forme COMPACTE pour la table année par année : pas de « € » (l'en-tête de
 * colonne le porte) et pas d'espace après le signe, la densité prime. Utilise
 * le vrai signe moins (U+2212) comme `formatEurosSigned`, jamais le trait
 * d'union — c'est le même montant, il doit s'écrire pareil.
 * Hors de cette table, utiliser `formatEurosSigned`. */
function signe(n: number): string {
  const r = Math.round(n) || 0; // normalise -0 → 0
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toLocaleString("fr-FR")}`;
}
