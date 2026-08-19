"use client";

import { useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Banknote, Calculator, Check, ChevronDown, Landmark, Plus, TrendingUp, X } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { AppSettings } from "@/lib/settings";
import { TONE_TEXT_CLASS, cashflowTone, type CashflowSeuils } from "@/lib/analyse/scoring";
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
  FRAIS_REVENTE_DEFAUT_PCT,
  type AnneeSimulation,
  type InputsResolus,
  type SimulationInputs,
  type SimulationResult,
} from "@/lib/simulation";
import { NumberField, SelectField } from "@/components/form/Fields";
import { GroupTitle, SectionHeader, SectionH2, TITRE_SECTION } from "@/components/SectionHeader";
import ConfirmDialog from "@/components/ConfirmDialog";
import { formatEuros, formatEurosSigned, formatNombre, formatPercent } from "@/lib/format";

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

/** Intitulé d'un groupe d'hypothèses (Crédit / Fiscalité / Projection). */
function HypGroupTitle({ children }: { children: ReactNode }) {
  return <GroupTitle className="mb-1">{children}</GroupTitle>;
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

/** Hypothèse optionnelle en lecture : « — » quand elle est désactivée OU
 *  fixée à 0 (0 est une valeur valide en édition, mais visuellement
 *  indissociable de « pas d'effet » — même traitement que « désactivée »).
 *  (`pct` est déjà pris plus bas par le calcul de part d'un total.) */
function hypPct(v: number | null): string {
  return v == null || v === 0 ? "—" : `${formatNombre(v)} %`;
}

/** Même règle que `hypPct`, pour un champ TOUJOURS renseigné (jamais
 *  désactivable) comme la quote-part terrain : seul le cas 0 % affiche « — ». */
function pctOrDash(v: number): string {
  return v === 0 ? "—" : `${formatNombre(v)} %`;
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
    <div className="flex w-full items-end gap-1">
      <div className="min-w-0 flex-1">
        <NumberField
          label={label}
          value={value}
          onChange={onChange}
          suffix={suffix}
          nonNegative
        />
      </div>
      <div className="mb-[3px] w-11 shrink-0 flex justify-center">
        <button
          type="button"
          onClick={() => onChange(null)}
          title="Désactiver cette hypothèse"
          aria-label={`Désactiver ${label}`}
          className="flex h-11 w-11 items-center justify-center rounded-md text-ink-400 transition-colors hover:text-ink-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
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

  // `inputs` = brouillon en cours d'édition (peut différer de ce qui est
  // STOCKÉ tant que « Enregistrer » n'a pas été cliqué). `resolus` = ce brouillon
  // une fois l'héritage du Profil investisseur appliqué — sert UNIQUEMENT à
  // afficher la valeur courante DANS les champs du formulaire d'édition
  // (Régime fiscal, TMI, Quote-part terrain), jamais ailleurs sur la page.
  const resolus = useMemo(() => resolveInputs(inputs, settings), [inputs, settings]);
  // Le brouillon de quote-part alimente la simulation pour que le CHAMP lui-même
  // affiche la bonne valeur pendant la frappe — mais `result` (calculé à partir
  // de ce brouillon) ne doit jamais fuiter en dehors du formulaire : voir
  // `resultAffiche` plus bas, seule source pour tout le reste de la page.
  const apartmentSim = useMemo(
    () =>
      quotePartDraft ? { ...apartment, quote_part_terrain_pct: quotePartDraft.value } : apartment,
    [apartment, quotePartDraft],
  );
  const result = useMemo(() => simulate(apartmentSim, resolus), [apartmentSim, resolus]);

  // Valeurs ENREGISTRÉES uniquement — c'est ce que toute la page affiche EN
  // DEHORS du formulaire d'édition (cash-flow, tableau année par année,
  // patrimoine, pastilles résumé…). Les chiffres de l'onglet ne doivent
  // changer qu'au clic sur « Enregistrer », jamais à la frappe : `inputs`/
  // `quotePartDraft` (brouillons) n'entrent pour rien dans ce calcul.
  const resolusAffiches = useMemo(
    () => resolveInputs(savedInputs, settings),
    [savedInputs, settings],
  );
  const resultAffiche = useMemo(() => simulate(apartment, resolusAffiches), [apartment, resolusAffiches]);
  // N'affiche « Réinitialiser » (bouton du mode LECTURE) que pour des
  // surcharges réellement ENREGISTRÉES — le brouillon `inputs` en cours de
  // frappe ne doit rien y changer avant l'enregistrement.
  const surchargesHyp = (savedInputs?.regimeFiscal != null && savedInputs.regimeFiscal !== REGIME_FISCAL_DEFAUT ? 1 : 0)
    + (savedInputs?.tmiPct != null ? 1 : 0)
    + (apartment.quote_part_terrain_pct != null ? 1 : 0)
    + (savedInputs?.revalorisationBienPct != null ? 1 : 0)
    + (savedInputs?.revalorisationLoyerPct != null ? 1 : 0)
    + (savedInputs?.indexationChargesPct != null ? 1 : 0)
    + (savedInputs?.vacanceLocativePct != null ? 1 : 0)
    + (savedInputs?.fraisReventePct != null ? 1 : 0);

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
      fraisReventePct: null,
    };
    setInputs(patched);
    setQuotePartDraft(null);
    setSnapshot(null);
    setEditingId(null);
    setConfirmReset(false);
    await persist(patched, { quote_part_terrain_pct: null });
  }

  if (!result || !resultAffiche) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-10 text-center">
        <Calculator className="mx-auto h-8 w-8 text-ink-300" />
        {/* H2 sémantique (section) + heading-h3 visuellement (18px)
            Pattern: cartes d'erreur/empty-state utilisent ce ratio */}
        <h2 className="mt-3 heading-h3">Projection financière</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">
          Renseigne d&apos;abord un loyer et un prix dans l&apos;onglet « Description de
          l&apos;appartement » pour simuler le cash-flow.
        </p>
      </div>
    );
  }

  // Somme des cash-flows RÉELS de chaque année (carte TRI). Volontairement pas
  // `cashflowMensuelMoyen × 12 × durée` : la moyenne affichée plus haut porte
  // sur les seules années exonérées d'impôt, elle ne reconstitue donc pas le
  // cumul sur toute la durée.
  const cumulCashflows = resultAffiche.annees.reduce((s, a) => s + a.cashflowAnnuel, 0);

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

          {/* Summary pills — toujours visibles, cliquable. Lisent les valeurs
              ENREGISTRÉES (`resolusAffiches`/`savedInputs`), jamais le brouillon
              `inputs` en cours de frappe : elles ne doivent pas changer avant
              l'enregistrement. Régime fiscal et TMI sont toujours renseignés
              (pas d'état désactivé) donc toujours affichés ; les 5 hypothèses
              de Projection n'apparaissent QUE si activées — même ordre que le
              formulaire (gestion, vacance, puis les autres), et chacune porte
              un libellé qui se lit seul, sans dépendre du titre de la carte. */}
          <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            {REGIMES_FISCAUX[resolusAffiches.regimeFiscal]}
          </span>
          <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
            TMI {formatNombre(resolusAffiches.tmiPct)} %
          </span>
          {savedInputs?.vacanceLocativePct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Vacance locative {formatNombre(savedInputs.vacanceLocativePct)} % du loyer
            </span>
          )}
          {savedInputs?.revalorisationBienPct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Revalorisation du bien {formatNombre(savedInputs.revalorisationBienPct)} %/an
            </span>
          )}
          {savedInputs?.revalorisationLoyerPct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Revalorisation du loyer {formatNombre(savedInputs.revalorisationLoyerPct)} %/an
            </span>
          )}
          {savedInputs?.indexationChargesPct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Indexation des charges {formatNombre(savedInputs.indexationChargesPct)} %/an
            </span>
          )}
          {savedInputs?.fraisReventePct != null && (
            <span className="rounded-full bg-ink-50 px-2.5 py-0.5 text-[11px] font-medium text-ink-600">
              Frais de revente {formatNombre(savedInputs.fraisReventePct)} % du prix
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
                      {/* Les trois champs partagent la même largeur : chacun réserve la
                          même gouttière `w-11` pour son bouton ✕ (même absent), sinon
                          le TMI — seul à porter réellement le bouton — serait plus
                          étroit que Régime fiscal et Quote-part terrain (cf. le pattern
                          `ChampHerite` de FinancementSection). */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-end gap-1">
                          <div className="min-w-0 flex-1">
                            <SelectField
                              label="Régime fiscal"
                              value={resolus.regimeFiscal}
                              onChange={(v) => set("regimeFiscal", v)}
                              options={REGIMES_FISCAUX_OPTIONS}
                              optionLabel={(v) => REGIMES_FISCAUX[v]}
                              allowEmpty={false}
                            />
                          </div>
                          <div className="w-11 shrink-0" />
                        </div>
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
                                className="flex h-11 w-11 items-center justify-center rounded-md text-ink-400 transition-colors hover:text-ink-700"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-end gap-1">
                          <div className="min-w-0 flex-1">
                            <NumberField
                              label="Quote-part terrain"
                              value={result.quotePartTerrainPct}
                              onChange={(v) => setQuotePartDraft({ value: v })}
                              suffix="% du prix"
                              nonNegative
                            />
                          </div>
                          <div className="w-11 shrink-0" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <HypGroupTitle>Projection</HypGroupTitle>
                      {/* `flex-wrap` : les boutons "+" (compacts, inline) enchaînaient sans
                          espace horizontal sous `space-y-3` — cet utilitaire n'ajoute une
                          marge qu'en `margin-top`, sans effet entre éléments d'une même
                          ligne. `gap-2.5` couvre les deux axes, boutons comme lignes actives. */}
                      <div className="flex flex-wrap gap-2.5">
                        <OptionalRateField
                          label="Vacance locative"
                          value={inputs.vacanceLocativePct}
                          defaut={VACANCE_LOCATIVE_DEFAUT_PCT}
                          onChange={(v) => set("vacanceLocativePct", v)}
                          suffix="% du loyer"
                        />
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
                          label="Frais de revente"
                          value={inputs.fraisReventePct}
                          defaut={FRAIS_REVENTE_DEFAUT_PCT}
                          onChange={(v) => set("fraisReventePct", v)}
                          suffix="% du prix"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-3">
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
                      <FinRow label="Régime fiscal" value={REGIMES_FISCAUX[resolusAffiches.regimeFiscal]} />
                      <FinRow
                        label="TMI"
                        value={`${formatNombre(resolusAffiches.tmiPct)} %`}
                        suffix={`+ ${formatNombre(LMNP.prelevementsSociauxPct)} % PS`}
                      />
                      <FinRow
                        label="Quote-part terrain"
                        value={pctOrDash(resultAffiche.quotePartTerrainPct)}
                      />
                    </div>
                    <div>
                      <FinSectionTitle>Projection</FinSectionTitle>
                      <FinRow label="Vacance locative" value={hypPct(savedInputs?.vacanceLocativePct ?? null)} />
                      <FinRow label="Revalorisation du bien" value={hypPct(savedInputs?.revalorisationBienPct ?? null)} />
                      <FinRow label="Revalorisation du loyer" value={hypPct(savedInputs?.revalorisationLoyerPct ?? null)} />
                      <FinRow label="Indexation charges" value={hypPct(savedInputs?.indexationChargesPct ?? null)} />
                      <FinRow label="Frais de revente" value={hypPct(savedInputs?.fraisReventePct ?? null)} />
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

      {/* KPI summary */}
      <SimKpiSummary result={resultAffiche} resolus={resolusAffiches} />

      {/* Graphiques (remontés avant le tableau) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <section className="min-w-0 space-y-3 rounded-xl border border-ink-100 bg-white p-5">
          <SectionH2 title="Financement du projet" />
          <p className="text-xs text-ink-400">
            {`D'où vient l'argent qui couvre le coût total de l'opération sur ${resolusAffiches.dureeAnnees} ans : les loyers collectés, une économie fiscale éventuelle, et la part de l'apport encore non « remboursée » par le cash-flow au terme.`}
          </p>
          <FinancementDonut financement={resultAffiche.financementProjet} />
        </section>

        <section className="min-w-0 space-y-4 rounded-xl border border-ink-100 bg-white p-5">
          <SectionH2 title="Évolution du patrimoine" />
          <p className="text-xs text-ink-400">
            Chaque année : la dette restante (ce qui reste dû à la banque), l&apos;enrichissement net
            (valeur du bien au-delà de la dette et de l&apos;apport non récupéré), et l&apos;effort
            d&apos;épargne encore porté (apport pas encore compensé par le cash-flow cumulé).{" "}
            {savedInputs?.revalorisationBienPct != null
              ? `Hypothèse de revalorisation du bien : ${savedInputs.revalorisationBienPct} %/an`
              : "Aucune revalorisation du bien supposée"}{" "}
            — hors fiscalité de la plus-value à la revente.
          </p>
          <PatrimoineChart annees={resultAffiche.annees} />
        </section>
      </div>

      {/* Rentabilité de l'opération (TRI) */}
      <section id="sim-tri" className="scroll-mt-24 space-y-4 rounded-xl border border-ink-100 bg-white p-5">
        <SectionH2 title="Rentabilité de l'opération" />
        <p className="text-xs text-ink-400">
          Le rendement net juge <strong className="font-medium text-ink-500">le bien</strong> : il
          divise le loyer par le coût total, quel que soit ton financement. Le TRI juge{" "}
          <strong className="font-medium text-ink-500">ton argent</strong> : il part du seul apport,
          suit les cash-flows année après année et intègre la revente. C&apos;est le seul chiffre où
          l&apos;effet de levier du crédit apparaît.
        </p>
        <ul className="divide-y divide-ink-100/50 text-sm">
          <WaterfallRow label="Apport initial" value={-resultAffiche.apport} />
          <WaterfallRow
            label={`Cash-flows cumulés sur ${resolusAffiches.dureeAnnees} ans`}
            value={cumulCashflows}
            plus={cumulCashflows >= 0}
          />
          <WaterfallRow
            label="Produit net de la revente"
            value={resultAffiche.produitNetRevente}
            plus={resultAffiche.produitNetRevente >= 0}
          />
        </ul>
        {/* ⚠️ Accent de marque, PAS une couleur sémantique : aucun seuil de TRI
            n'existe dans le Profil investisseur, et la charte veut qu'un chiffre
            en émeraude/ambre/rouge soit adossé à un seuil documenté. Ne pas en
            inventer un ici — voir docs/reference/couleurs-scoring.md. */}
        <div className="rounded-xl bg-accent-50 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <span className="text-sm font-semibold text-accent-700">TRI</span>
              <p className="mt-0.5 text-xs text-accent-700/70">
                {resultAffiche.tri != null
                  ? `Annualisé sur ${resolusAffiches.dureeAnnees} ans, revente incluse`
                  : "Non calculable"}
              </p>
            </div>
            <span className="whitespace-nowrap font-mono text-2xl font-bold tabular-nums text-accent-700">
              {resultAffiche.tri != null ? formatPercent(resultAffiche.tri) : "—"}
            </span>
          </div>
          <div className="mt-3 rounded-lg bg-white px-3 py-2.5 text-xs leading-relaxed text-ink-500">
            {resultAffiche.triIndisponible === "aucun_capital_engage" ? (
              <>
                <strong className="font-semibold text-ink-700">Aucun capital engagé.</strong>{" "}
                L&apos;emprunt couvre toute l&apos;opération et chaque année dégage un cash-flow
                positif : cet investissement ne te demande jamais d&apos;argent, un taux de
                rendement n&apos;a donc pas de valeur définie. Regarde le cash-flow mensuel plus
                haut, c&apos;est lui qui décrit l&apos;opération.
              </>
            ) : resultAffiche.triIndisponible === "pas_de_racine" ? (
              <>
                <strong className="font-semibold text-ink-700">TRI non calculable</strong> sur cette
                combinaison de flux — l&apos;opération ne présente aucun retour sur le capital
                engagé.
              </>
            ) : (
              <>
                <strong className="font-semibold text-ink-700">Comment le lire :</strong>{" "}
                {resultAffiche.apport > 0 ? (
                  <>
                    placer ton apport de {euros(resultAffiche.apport)} € à{" "}
                    <strong className="font-medium text-ink-700">
                      {formatPercent(resultAffiche.tri)}
                    </strong>{" "}
                    par an pendant {resolusAffiches.dureeAnnees} ans donnerait le même résultat final
                    que cette opération.
                  </>
                ) : (
                  <>
                    {/* Apport nul ET TRI défini : le capital engagé n'est pas versé au
                        départ, il est étalé (cash-flows négatifs). Parler d'« apport de
                        0 € » n'aurait aucun sens ici. */}
                    l&apos;opération est financée à 100 % par le crédit : le capital que tu engages
                    n&apos;est pas un apport initial mais l&apos;effort d&apos;épargne que tu
                    injectes chaque année. Il te rapporte{" "}
                    <strong className="font-medium text-ink-700">
                      {formatPercent(resultAffiche.tri)}
                    </strong>{" "}
                    par an.
                  </>
                )}{" "}
                {savedInputs?.fraisReventePct != null
                  ? `Revente supposée minorée de ${formatNombre(savedInputs.fraisReventePct)} % de frais`
                  : "Revente supposée sans frais (agence, diagnostics)"}
                {savedInputs?.revalorisationBienPct != null
                  ? `, bien revalorisé à ${formatNombre(savedInputs.revalorisationBienPct)} %/an`
                  : ", sans revalorisation du bien"}{" "}
                — hors fiscalité de la plus-value.
              </>
            )}
          </div>
        </div>
      </section>

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
                  {resultAffiche.annees.map((a) => (
                    <tr key={a.annee} className="hover:bg-ink-50/60">
                      <td className="px-2 py-1.5 text-ink-500 sm:px-5">{a.annee}</td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">{euros(a.loyers)}</td>
                      <td className="px-1.5 py-1.5 text-right text-ink-700 sm:px-3">
                        {euros(-(resultAffiche.mensualiteTotale * 12))}
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
              Total impôts sur {resolusAffiches.dureeAnnees} ans : {euros(resultAffiche.totalImpots)} € · loyer{" "}
              {savedInputs?.revalorisationLoyerPct != null
                ? `revalorisé à ${savedInputs.revalorisationLoyerPct} %/an`
                : "supposé constant (pas de revalorisation)"}{" "}
              ; charges de copropriété et taxe foncière{" "}
              {savedInputs?.indexationChargesPct != null
                ? `indexées à ${savedInputs.indexationChargesPct} %/an`
                : "supposées constantes (pas d'indexation)"}
              {savedInputs?.vacanceLocativePct != null
                ? ` ; vacance locative ${savedInputs.vacanceLocativePct} %`
                : ""}
              .
            </p>
          </div>
        )}
      </section>

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

function SimKpiSummary({ result, resolus }: { result: SimulationResult; resolus: InputsResolus }) {
  const enrichissementNet = result.annees[result.annees.length - 1]?.enrichissement ?? null;
  const pointMort = result.annees.findIndex((a) => a.enrichissement > 0);

  const kpis: { label: string; value: string; detail: string; icon: ReactNode }[] = [
    {
      label: "TRI",
      value: result.tri != null ? formatPercent(result.tri) : "—",
      detail: "Taux de rendement interne",
      icon: <TrendingUp className="h-4 w-4 text-accent-500" />,
    },
    {
      label: "Cash-flow moyen",
      value: formatEurosSigned(result.cashflowMensuelMoyen),
      detail: "Mensuel après impôt",
      icon: <Banknote className="h-4 w-4 text-emerald-500" />,
    },
    {
      label: "Enrichissement net",
      value: enrichissementNet != null ? formatEuros(Math.round(enrichissementNet)) : "—",
      detail: `Au terme (${result.annees.length} ans)`,
      icon: <Landmark className="h-4 w-4 text-violet-500" />,
    },
    {
      label: "Point mort",
      value: pointMort >= 0 ? `${pointMort + 1} ans` : "—",
      detail: "Enrichissement > 0",
      icon: <Check className="h-4 w-4 text-sky-500" />,
    },
  ];

  return (
    <section className="space-y-3">
      <div>
        <SectionH2 title="Vue d'ensemble" />
        <p className="mt-0.5 text-[10px] text-ink-400">
          Hypothèses : taux {resolus.tauxCreditPct} %, durée {resolus.dureeAnnees} ans, TMI{" "}
          {resolus.tmiPct} %
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="flex items-start gap-3 rounded-xl border border-ink-100 bg-white p-4">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-50">
              {kpi.icon}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-ink-500">{kpi.label}</p>
              <p className="font-mono text-lg font-semibold tabular-nums text-ink-900">{kpi.value}</p>
              <p className="text-[10px] text-ink-400">{kpi.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
