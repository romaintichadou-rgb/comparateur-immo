"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Banknote,
  ClipboardList,
  ExternalLink,
  Home,
  KeyRound,
  Mail,
  Phone,
  ReceiptText,
  Star,
  User,
} from "lucide-react";
import {
  DPE_GES_VALEURS,
  ETATS_BIEN,
  STATUTS,
  TYPES_BIEN,
  type ApartmentPatch,
  type ApartmentWithComputed,
  type ChampEstimable,
  type Statut,
} from "@/lib/types";
import { computeDerived } from "@/lib/calculations";
import {
  estimateAssurance,
  estimateChargesCopro,
  estimateFraisNotaire,
  estimateTaxeFonciere,
} from "@/lib/estimates";
import { formatApartmentTitle, formatDate, formatEuros, formatPercent } from "@/lib/format";
import {
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

function isEstimated(apt: ApartmentWithComputed, key: ChampEstimable): boolean {
  return apt[key] != null && !apt.champs_manuels.includes(key);
}

type Tab = "ia" | "donnees" | "financiere" | "simulation";

const TABS: { key: Tab; label: string }[] = [
  { key: "ia", label: "Analyse IA" },
  { key: "donnees", label: "Description de l'appartement" },
  { key: "financiere", label: "Détails de l'opération" },
  { key: "simulation", label: "Simulation financière" },
];

const STATUT_STYLES: Record<string, string> = {
  "à visiter": "bg-blue-50 text-blue-700",
  visité: "bg-violet-50 text-violet-700",
  abandonné: "bg-slate-100 text-slate-500",
  acheté: "bg-emerald-50 text-emerald-700",
};

export default function ApartmentDetail({
  apartment: initial,
  settings,
}: {
  apartment: ApartmentWithComputed;
  settings: AppSettings;
}) {
  const seuilsRendement = seuilsRendementFromSettings(settings);
  const [apt, setApt] = useState(initial);
  const [descPatch, setDescPatch] = useState<ApartmentPatch>({});
  const [finPatch, setFinPatch] = useState<ApartmentPatch>({});
  const [savingDesc, setSavingDesc] = useState(false);
  const [savingFin, setSavingFin] = useState(false);
  const [reestimating, setReestimating] = useState(false);
  const [reestimateError, setReestimateError] = useState<string | null>(null);
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

  // Tant qu'un champ estimable n'a pas été repris manuellement (badge
  // "estimé" toujours affiché), sa valeur suit en direct les champs dont il
  // dépend — au lieu de rester figée sur l'estimation faite à la création.
  const fraisNotaireManuel =
    apt.champs_manuels.includes("frais_notaire_estimes") || "frais_notaire_estimes" in finPatch;
  const fraisNotaireLive = fraisNotaireManuel
    ? merged.frais_notaire_estimes
    : estimateFraisNotaire(merged.prix, merged.etat_bien);

  const taxeFonciereManuel =
    apt.champs_manuels.includes("taxe_fonciere") || "taxe_fonciere" in finPatch;
  const taxeFonciereLive = taxeFonciereManuel
    ? merged.taxe_fonciere
    : estimateTaxeFonciere(merged.surface_m2);

  const chargesCoproManuel =
    apt.champs_manuels.includes("charges_copro_annuelles") || "charges_copro_annuelles" in finPatch;
  const chargesCoproLive = chargesCoproManuel ? merged.charges_copro_annuelles : estimateChargesCopro();

  const assuranceManuel =
    apt.champs_manuels.includes("assurance_annuelle") || "assurance_annuelle" in finPatch;
  const assuranceLive = assuranceManuel ? merged.assurance_annuelle : estimateAssurance();

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

  const descDirty = Object.keys(descPatch).length > 0;
  const finDirty = Object.keys(finPatch).length > 0;
  const localisation = apt.adresse || [apt.quartier, apt.ville].filter(Boolean).join(", ");

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour à la liste
      </Link>

      {/* En-tête */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {apt.photo_url ? (
          <div className="relative h-56 w-full sm:h-72">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={apt.photo_url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
              <h1 className="text-2xl font-semibold text-white sm:text-3xl">
                {formatApartmentTitle(apt)}
              </h1>
              {localisation && <p className="mt-1 text-sm text-white/85">{localisation}</p>}
            </div>
          </div>
        ) : (
          <div className="p-6">
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
              {formatApartmentTitle(apt)}
            </h1>
            {localisation && <p className="mt-1 text-sm text-slate-500">{localisation}</p>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 px-5 py-3 text-sm text-slate-500 sm:px-6">
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
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
              >
                Voir l&apos;annonce <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </>
          )}
        </div>
      </div>

      {/* Onglets */}
      <div className="border-b border-slate-200">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 px-1 py-3 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === "ia" && <AnalyseIA apartment={apt} onAnalysed={setApt} />}

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
            />
            <ResultCard
              label="Rendement net"
              sub="après charges, hors crédit et fiscalité"
              value={formatPercent(live.rendement_net)}
              tone={rendementNetTone(live.rendement_net, seuilsRendement)}
              emphase
            />
          </div>

          {finDirty && (
            <div className="flex items-center justify-between gap-3 rounded-md bg-indigo-50 px-4 py-2.5">
              <p className="text-xs text-indigo-700">Modifications non enregistrées.</p>
              <button
                onClick={() => save(finPatch, setSavingFin, () => setFinPatch({}))}
                disabled={savingFin}
                className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {savingFin ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          )}

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Banknote className="h-4 w-4 text-slate-400" />
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

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <KeyRound className="h-4 w-4 text-slate-400" />
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
                    hint={isEstimated(apt, "loyer_retenu") && !("loyer_retenu" in finPatch) && <EstimatedBadge />}
                  />
                </div>
                <button
                  onClick={handleReestimer}
                  disabled={reestimating}
                  className="mb-[1px] shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
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
                <p className="sm:col-span-2 rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                  {apt.loyer_justification}
                </p>
              )}
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <ReceiptText className="h-4 w-4 text-slate-400" />
              Charges annuelles
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <NumberField
                label="Charges copro annuelles"
                value={chargesCoproLive}
                onChange={(v) => setFinPatch((p) => ({ ...p, charges_copro_annuelles: v }))}
                suffix="€/an"
                hint={!chargesCoproManuel && chargesCoproLive != null && <EstimatedBadge />}
              />
              <NumberField
                label="Taxe foncière"
                value={taxeFonciereLive}
                onChange={(v) => setFinPatch((p) => ({ ...p, taxe_fonciere: v }))}
                suffix="€/an"
                hint={!taxeFonciereManuel && taxeFonciereLive != null && <EstimatedBadge />}
              />
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
        <SimulationFinanciere apartment={live} settings={settings} />
      )}

      {activeTab === "donnees" && (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        {/* Colonne principale */}
        <div className="min-w-0 space-y-6">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <Home className="h-4 w-4 text-slate-400" />
                Description du bien
              </h2>
              {descDirty && (
                <button
                  onClick={() => save(descPatch, setSavingDesc, () => setDescPatch({}))}
                  disabled={savingDesc}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {savingDesc ? "Enregistrement..." : "Enregistrer"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Ville" value={value(descPatch, "ville")} onChange={(v) => setDescPatch((p) => ({ ...p, ville: v }))} />
              <TextField label="Quartier" value={value(descPatch, "quartier")} onChange={(v) => setDescPatch((p) => ({ ...p, quartier: v }))} />
              <TextField label="Adresse" value={value(descPatch, "adresse")} onChange={(v) => setDescPatch((p) => ({ ...p, adresse: v }))} />
              <SelectField label="Type de bien" value={value(descPatch, "type_bien") as (typeof TYPES_BIEN)[number] | ""} onChange={(v) => setDescPatch((p) => ({ ...p, type_bien: v }))} options={TYPES_BIEN} />
              <NumberField label="Surface" value={value(descPatch, "surface_m2")} onChange={(v) => setDescPatch((p) => ({ ...p, surface_m2: v }))} suffix="m²" />
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
                  value={apt.statut}
                  onChange={(e) => patchNow({ statut: e.target.value as Statut })}
                  className={`w-full rounded-full border-0 px-3 py-1.5 text-sm font-medium ${
                    STATUT_STYLES[apt.statut] ?? "bg-slate-100 text-slate-600"
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

          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <User className="h-4 w-4 text-slate-400" />
              Contact
            </h2>
            <p className="mb-3 text-xs text-slate-400">
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
                    className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
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
                    className="mt-1 inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
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
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-slate-500">
        {value}
      </div>
    </div>
  );
}
