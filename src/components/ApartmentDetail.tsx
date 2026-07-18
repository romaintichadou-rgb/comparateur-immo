"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  ClipboardList,
  ExternalLink,
  Home,
  KeyRound,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
  Sparkles,
  Star,
  User,
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
} from "@/lib/estimates";
import { formatApartmentTitle, formatDate, formatEuros, formatPercent } from "@/lib/format";
import {
  AiEstimatedBadge,
  BooleanField,
  EstimatedBadge,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from "@/components/form/Fields";
import AnalyseIA from "@/components/AnalyseIA";
import SimulationFinanciere, { ResultCard } from "@/components/SimulationFinanciere";
import { rendementNetTone, seuilsRendementFromSettings } from "@/lib/analyse/scoring";
import type { AppSettings } from "@/lib/settings";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { useDeleteApartment } from "@/components/useDeleteApartment";
import ProcessingStepsList, { type ProcessingStep } from "@/components/ProcessingStepsList";

const ApartmentLocationMap = dynamic(() => import("./ApartmentLocationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-ink-100 text-xs text-ink-400">
      Chargement de la carte...
    </div>
  ),
});

/** Badge à afficher à côté d'un champ de charges en cours d'édition (aucun),
 * estimé par IA, estimé par la formule déterministe locale, ou manuel
 * (aucun badge non plus). */
function chargeFieldHint(
  apt: ApartmentWithComputed,
  finPatch: ApartmentPatch,
  key: "charges_copro_annuelles" | "taxe_fonciere",
  manuel: boolean,
  liveValue: number | null
) {
  if (key in finPatch) return undefined;
  if (isAiEstimated(apt, key)) return <AiEstimatedBadge />;
  return !manuel && liveValue != null && <EstimatedBadge />;
}

type Tab = "ia" | "donnees" | "financiere" | "simulation";

const TABS: { key: Tab; label: string }[] = [
  { key: "ia", label: "Analyse IA" },
  { key: "donnees", label: "Description du bien" },
  { key: "financiere", label: "Détails de l'opération" },
  { key: "simulation", label: "Simulation financière" },
];

// Étapes rejouées après l'enregistrement d'une modification de la
// description du bien : ville, surface, type de bien... irriguent le loyer
// estimé, les charges estimées et toute l'Analyse IA (comparaison DVF,
// géocodage...). Laisser ces valeurs sans les recalculer les rendrait
// silencieusement fausses — même geste qu'à la création (AddApartmentFlow),
// volontairement pas automatique ailleurs (onglet Détails de l'opération),
// pour ne pas déclencher ces 3 appels IA à chaque sauvegarde de l'app.
type DescProcPhase = "saving" | "renting" | "charging" | "analysing";
const DESC_PROC_STEPS: ProcessingStep<DescProcPhase>[] = [
  { key: "saving", label: "Enregistrement des modifications", detail: "Mise à jour de la description du bien." },
  { key: "renting", label: "Estimation du loyer de marché", detail: "Loyer de référence du secteur via IA et données publiques." },
  { key: "charging", label: "Estimation des charges annuelles", detail: "Charges de copropriété (ou d'exploitation) et taxe foncière via IA." },
  { key: "analysing", label: "Analyse IA complète", detail: "Prix (DVF), risques (ADEME, Géorisques), potentiel du quartier." },
];

const STATUT_STYLES: Record<string, string> = {
  "à visiter": "bg-blue-50 text-blue-700",
  visité: "bg-violet-50 text-violet-700",
  abandonné: "bg-ink-100 text-ink-500",
  acheté: "bg-emerald-50 text-emerald-700",
};

export default function ApartmentDetail({
  apartment: initial,
  settings,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
}) {
  const router = useRouter();
  const seuilsRendement = seuilsRendementFromSettings(settings);
  const { open: openRendementDetail } = useRendementDetail();
  // Après suppression depuis la fiche, on quitte vers l'accueil (la fiche
  // n'existe plus) — au lieu du router.refresh() utilisé dans la liste.
  const { requestDelete, dialog: deleteDialog } = useDeleteApartment(() => router.push("/"));
  const [apt, setApt] = useState(initial);
  const [descPatch, setDescPatch] = useState<ApartmentPatch>({});
  const [finPatch, setFinPatch] = useState<ApartmentPatch>({});
  const [editingDesc, setEditingDesc] = useState(false);
  const [descProcPhase, setDescProcPhase] = useState<DescProcPhase | null>(null);
  const [savingFin, setSavingFin] = useState(false);
  const [reestimating, setReestimating] = useState(false);
  const [reestimateError, setReestimateError] = useState<string | null>(null);
  const [reestimatingCharges, setReestimatingCharges] = useState(false);
  const [reestimateChargesError, setReestimateChargesError] = useState<string | null>(null);
  const [contactNom, setContactNom] = useState(apt.contact_nom);
  const [contactTel, setContactTel] = useState(apt.contact_telephone);
  const [contactEmail, setContactEmail] = useState(apt.contact_email);
  const [notesLocal, setNotesLocal] = useState(apt.notes);
  const [activeTab, setActiveTab] = useState<Tab>("ia");

  const value = <K extends keyof ApartmentWithComputed>(
    patch: ApartmentPatch,
    key: K
  ): ApartmentWithComputed[K] =>
    (key in patch ? (patch as Record<string, unknown>)[key] : apt[key]) as ApartmentWithComputed[K];

  const merged = { ...apt, ...descPatch, ...finPatch };
  // Type effectif (édition en cours comprise) : pilote les libellés et les
  // estimations de charges/assurance, qui diffèrent pour un immeuble.
  const immeuble = isImmeuble(merged.type_bien);

  // Tant qu'un champ estimable n'a pas été repris manuellement (badge
  // "estimé" toujours affiché), sa valeur suit en direct les champs dont il
  // dépend — au lieu de rester figée sur l'estimation faite à la création.
  const fraisNotaireManuel =
    apt.champs_manuels.includes("frais_notaire_estimes") || "frais_notaire_estimes" in finPatch;
  const fraisNotaireLive = fraisNotaireManuel
    ? merged.frais_notaire_estimes
    : estimateFraisNotaire(merged.prix, merged.etat_bien);

  // Un champ estimé par IA (champs_estimes_ia) est lui aussi "figé" pour cet
  // aperçu live : la formule déterministe ne doit pas prendre le pas sur une
  // valeur IA tant que le champ n'est pas explicitement en cours d'édition —
  // même logique que applyLiveEstimates côté serveur (voir estimates.ts).
  const taxeFonciereManuel =
    apt.champs_manuels.includes("taxe_fonciere") || "taxe_fonciere" in finPatch;
  const taxeFonciereFige = taxeFonciereManuel || (apt.champs_estimes_ia.includes("taxe_fonciere") && !("taxe_fonciere" in finPatch));
  const taxeFonciereLive = taxeFonciereFige
    ? merged.taxe_fonciere
    : estimateTaxeFonciere(merged.surface_m2);

  const chargesCoproManuel =
    apt.champs_manuels.includes("charges_copro_annuelles") || "charges_copro_annuelles" in finPatch;
  const chargesCoproFige =
    chargesCoproManuel || (apt.champs_estimes_ia.includes("charges_copro_annuelles") && !("charges_copro_annuelles" in finPatch));
  const chargesCoproLive = chargesCoproFige
    ? merged.charges_copro_annuelles
    : estimateChargesCopro(merged.surface_m2, immeuble);

  const assuranceManuel =
    apt.champs_manuels.includes("assurance_annuelle") || "assurance_annuelle" in finPatch;
  const assuranceLive = assuranceManuel
    ? merged.assurance_annuelle
    : estimateAssurance(immeuble, merged.nb_lots, merged.surface_m2);

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
    [apt, descPatch, finPatch, fraisNotaireLive, taxeFonciereLive, chargesCoproLive, assuranceLive]
  );

  async function save(patch: ApartmentPatch, setSaving: (b: boolean) => void, clear: () => void) {
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/apartments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const { apartment } = await res.json();
        setApt(apartment);
        clear();
      }
    } finally {
      setSaving(false);
    }
  }

  // Sauvegarde de la description du bien, suivie d'une remise à jour complète
  // — mêmes 3 appels IA que la création (AddApartmentFlow), dans le même
  // ordre, pour que le loyer/les charges/l'analyse ne restent jamais calés
  // sur des ville/surface/type de bien périmés. Chaque étape reste best-effort
  // (une erreur n'interrompt pas les suivantes, comme à la création) : au pire
  // une étape est réestimable individuellement depuis son propre onglet.
  async function handleSaveDesc() {
    const patch = descPatch;
    if (Object.keys(patch).length === 0) {
      setEditingDesc(false);
      return;
    }

    setDescProcPhase("saving");
    try {
      const res = await fetch(`/api/apartments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) setApt((await res.json()).apartment);
    } catch {
      // non bloquant : les étapes suivantes tournent sur les valeurs déjà en base.
    }
    setDescPatch({});

    setDescProcPhase("renting");
    try {
      const res = await fetch("/api/estimate-rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId: apt.id }),
      });
      if (res.ok) setApt((await res.json()).apartment);
    } catch {
      // non bloquant : réestimable depuis "Détails de l'opération".
    }

    setDescProcPhase("charging");
    try {
      const res = await fetch("/api/estimate-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId: apt.id }),
      });
      if (res.ok) setApt((await res.json()).apartment);
    } catch {
      // non bloquant : réestimable depuis "Détails de l'opération".
    }

    setDescProcPhase("analysing");
    try {
      const res = await fetch(`/api/analyse/${apt.id}`, { method: "POST" });
      if (res.ok) setApt((await res.json()).apartment);
    } catch {
      // non bloquant : relançable depuis l'onglet Analyse IA.
    }

    setDescProcPhase(null);
    setEditingDesc(false);
    setActiveTab("ia");
  }

  function handleCancelDesc() {
    setDescPatch({});
    setEditingDesc(false);
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

  async function handleReestimer() {
    setReestimating(true);
    setReestimateError(null);
    try {
      const res = await fetch("/api/estimate-rent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId: apt.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setApt(data.apartment);
      } else {
        setReestimateError(data.error ?? "Échec de l'estimation.");
      }
    } catch {
      setReestimateError("Erreur réseau pendant l'estimation.");
    } finally {
      setReestimating(false);
    }
  }

  async function handleReestimerCharges() {
    setReestimatingCharges(true);
    setReestimateChargesError(null);
    try {
      const res = await fetch("/api/estimate-charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apartmentId: apt.id }),
      });
      const data = await res.json();
      if (res.ok) {
        setApt(data.apartment);
      } else {
        setReestimateChargesError(data.error ?? "Échec de l'estimation.");
      }
    } catch {
      setReestimateChargesError("Erreur réseau pendant l'estimation.");
    } finally {
      setReestimatingCharges(false);
    }
  }

  const finDirty = Object.keys(finPatch).length > 0;
  const localisation = apt.adresse || [apt.quartier, apt.ville].filter(Boolean).join(", ");
  const hasCoords = Number.isFinite(apt.latitude) && Number.isFinite(apt.longitude);
  const localisationApproximative = apt.precision_localisation === "arrondissement";

  return (
    <>
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-500 sm:px-6">
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
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`shrink-0 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-accent-600 text-accent-600"
                  : "border-transparent text-ink-500 hover:text-ink-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "ia" && (
        <AnalyseIA apartment={apt} seuilsRendement={seuilsRendement} onAnalysed={setApt} />
      )}

      {activeTab === "financiere" && (
        <div className="space-y-6">
          {/* Résultat principal : la rentabilité au premier coup d'œil */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ResultCard
              label="Budget total de l'opération"
              sub="achat + notaire + travaux"
              value={formatEuros(live.budget_total)}
              tone="neutral"
            />
            <ResultCard
              label="Rendement brut"
              sub="loyer annuel / budget total"
              value={formatPercent(live.rendement_brut)}
              tone="neutral"
              onClick={() => openRendementDetail(live, seuilsRendement)}
            />
            <ResultCard
              label="Rendement net"
              sub="après charges, hors crédit et fiscalité"
              value={formatPercent(live.rendement_net)}
              tone={rendementNetTone(live.rendement_net, seuilsRendement)}
              emphase
              onClick={() => openRendementDetail(live, seuilsRendement)}
            />
          </div>

          {finDirty && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-accent-50 px-4 py-2.5">
              <p className="text-xs text-accent-700">Modifications non enregistrées.</p>
              <button
                onClick={() => save(finPatch, setSavingFin, () => setFinPatch({}))}
                disabled={savingFin}
                className="shrink-0 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
              >
                {savingFin ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          )}

          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <Banknote className="h-4 w-4 text-ink-400" />
              Achat
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField label="Prix" value={value(finPatch, "prix")} onChange={(v) => setFinPatch((p) => ({ ...p, prix: v }))} suffix="€" />
              <NumberField
                label="Travaux"
                value={value(finPatch, "travaux")}
                onChange={(v) => setFinPatch((p) => ({ ...p, travaux: v }))}
                suffix="€"
              />
              <div className="sm:col-span-2">
                <NumberField
                  label="Frais de notaire"
                  value={fraisNotaireLive}
                  onChange={(v) => setFinPatch((p) => ({ ...p, frais_notaire_estimes: v }))}
                  suffix="€"
                  hint={!fraisNotaireManuel && fraisNotaireLive != null && <EstimatedBadge />}
                />
              </div>
              <ReadOnlyField label="Budget total (calculé)" value={formatEuros(live.budget_total)} />
              <ReadOnlyField
                label="Prix / m² — achat + travaux (calculé)"
                value={formatEuros(live.prix_m2)}
              />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <KeyRound className="h-4 w-4 text-ink-400" />
              Location
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2 flex items-end gap-3">
                <div className="flex-1">
                  <NumberField
                    label="Loyer mensuel, charges comprises"
                    value={value(finPatch, "loyer_retenu")}
                    onChange={(v) => setFinPatch((p) => ({ ...p, loyer_retenu: v }))}
                    suffix="€/mois CC"
                    hint={isAiEstimated(apt, "loyer_retenu") && !("loyer_retenu" in finPatch) && <AiEstimatedBadge />}
                  />
                </div>
                <button
                  onClick={handleReestimer}
                  disabled={reestimating}
                  className="mb-[1px] shrink-0 rounded-md border border-accent-200 bg-accent-50 px-3 py-2 text-xs font-medium text-accent-700 hover:bg-accent-100 disabled:opacity-50"
                >
                  {reestimating ? "Estimation..." : "Réestimer"}
                </button>
              </div>
              {reestimateError && (
                <p className="sm:col-span-2 rounded-md bg-amber-50 p-3 text-xs text-amber-700">
                  {reestimateError}
                </p>
              )}
              {apt.loyer_justification && (
                <p className="sm:col-span-2 rounded-md bg-ink-50 p-3 text-xs text-ink-600">
                  {apt.loyer_justification}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
                <ReceiptText className="h-4 w-4 text-ink-400" />
                Charges annuelles
              </h2>
              <button
                onClick={handleReestimerCharges}
                disabled={reestimatingCharges}
                className="shrink-0 rounded-md border border-accent-200 bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-100 disabled:opacity-50"
              >
                {reestimatingCharges ? "Estimation..." : "Réestimer"}
              </button>
            </div>
            {reestimateChargesError && (
              <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-700">{reestimateChargesError}</p>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <NumberField
                  label={immeuble ? "Charges d'exploitation annuelles" : "Charges copro annuelles"}
                  value={chargesCoproLive}
                  onChange={(v) => setFinPatch((p) => ({ ...p, charges_copro_annuelles: v }))}
                  suffix="€/an"
                  hint={chargeFieldHint(apt, finPatch, "charges_copro_annuelles", chargesCoproManuel, chargesCoproLive)}
                />
                {apt.charges_justification && !("charges_copro_annuelles" in finPatch) && (
                  <p className="mt-2 rounded-md bg-ink-50 p-3 text-xs text-ink-600">{apt.charges_justification}</p>
                )}
              </div>
              <div>
                <NumberField
                  label="Taxe foncière"
                  value={taxeFonciereLive}
                  onChange={(v) => setFinPatch((p) => ({ ...p, taxe_fonciere: v }))}
                  suffix="€/an"
                  hint={chargeFieldHint(apt, finPatch, "taxe_fonciere", taxeFonciereManuel, taxeFonciereLive)}
                />
                {apt.taxe_fonciere_justification && !("taxe_fonciere" in finPatch) && (
                  <p className="mt-2 rounded-md bg-ink-50 p-3 text-xs text-ink-600">{apt.taxe_fonciere_justification}</p>
                )}
              </div>
              <NumberField
                label="Assurance"
                value={assuranceLive}
                onChange={(v) => setFinPatch((p) => ({ ...p, assurance_annuelle: v }))}
                suffix="€/an"
                hint={!assuranceManuel && assuranceLive != null && <EstimatedBadge />}
              />
              <NumberField
                label="Frais de gestion locative"
                value={value(finPatch, "hypothese_gestion_pct")}
                onChange={(v) => setFinPatch((p) => ({ ...p, hypothese_gestion_pct: v ?? 0 }))}
                suffix="% du loyer"
              />
            </div>
          </section>
        </div>
      )}

      {activeTab === "simulation" && (
        <SimulationFinanciere apartment={live} settings={settings} onSaved={setApt} />
      )}

      {activeTab === "donnees" && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Colonne principale */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-4 rounded-xl border border-ink-200 bg-white p-6">
            {descProcPhase ? (
              <div className="px-2 py-10 text-center">
                <h2 className="font-display flex items-center justify-center gap-2 text-lg font-semibold text-ink-900">
                  <Sparkles className="h-5 w-5 text-accent-500" />
                  Mise à jour du bien en cours
                </h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
                  Les modifications sont enregistrées, puis le loyer, les charges et l&apos;analyse
                  sont recalculés à partir des nouvelles informations.
                </p>
                <div className="mt-6">
                  <ProcessingStepsList steps={DESC_PROC_STEPS} currentKey={descProcPhase} />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
                    <Home className="h-4 w-4 text-ink-400" />
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
                      <ReadOnlyPhotoField url={apt.photo_url} />
                    </div>
                    <ReadOnlyField label="Description" value={apt.description || "—"} />
                  </>
                )}
              </>
            )}
          </section>
        </div>

        {/* Colonne latérale */}
        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-ink-200 bg-white p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-500">
              <ClipboardList className="h-4 w-4 text-ink-400" />
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
              <User className="h-4 w-4 text-ink-400" />
              Contact
            </h2>
            <p className="mb-3 text-xs text-ink-400">
              Agence ou propriétaire — facultatif, enregistré automatiquement.
            </p>
            <div className="space-y-3">
              <TextField
                label="Nom"
                value={contactNom}
                onChange={setContactNom}
                onBlur={() => commitContact("contact_nom", contactNom)}
              />
              <div>
                <TextField
                  label="Téléphone"
                  value={contactTel}
                  onChange={setContactTel}
                  onBlur={() => commitContact("contact_telephone", contactTel)}
                />
                {apt.contact_telephone && (
                  <a
                    href={`tel:${apt.contact_telephone.replace(/\s/g, "")}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-800"
                  >
                    <Phone className="h-3 w-3" /> Appeler
                  </a>
                )}
              </div>
              <div>
                <TextField
                  label="Email"
                  value={contactEmail}
                  onChange={setContactEmail}
                  onBlur={() => commitContact("contact_email", contactEmail)}
                />
                {apt.contact_email && (
                  <a
                    href={`mailto:${apt.contact_email}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs text-accent-600 hover:text-accent-800"
                  >
                    <Mail className="h-3 w-3" /> Écrire
                  </a>
                )}
              </div>
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

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink-700">{label}</span>
      <div className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-ink-500">
        {value}
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
function ReadOnlyPhotoField({ url }: { url: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink-700">Photo</span>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-20 w-20 rounded-md border border-ink-200 object-cover" />
      ) : (
        <div className="rounded-md border border-dashed border-ink-200 bg-ink-50 px-3 py-2 text-ink-500">—</div>
      )}
    </div>
  );
}
