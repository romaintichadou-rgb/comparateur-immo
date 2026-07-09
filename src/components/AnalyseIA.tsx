"use client";

import { useState, type ReactNode } from "react";
import { AlertTriangle, Banknote, Calculator, CheckCircle2, Clock, Info, KeyRound, Loader2, MapPin, ShieldAlert, Sparkles, TrendingUp } from "lucide-react";
import type { ApartmentWithComputed } from "@/lib/types";
import type { BlocAnalyse, BlocHighlight, BlocKey, Fait, FaitGravite, Verdict, VerdictNiveau } from "@/lib/analyse/types";
import { RENDEMENT_HOVER_RING, SEUILS_RENDEMENT_DEFAUT, type RendementSeuils } from "@/lib/analyse/scoring";
import { useRendementDetail } from "@/components/RendementDetailProvider";
import { formatDateTime } from "@/lib/format";

// Les seuls BlocHighlight aujourd'hui affichés (bloc "location") sont les
// deux rendements — on les rend cliquables en les identifiant par leur
// libellé plutôt qu'en alourdissant le contrat BlocHighlight d'un flag
// dédié à ce seul usage.
const HIGHLIGHTS_RENDEMENT = new Set(["Rendement brut", "Rendement net"]);

const HIGHLIGHT_TONES: Record<BlocHighlight["tone"], { wrap: string; label: string; value: string }> = {
  neutral: { wrap: "bg-slate-50", label: "text-slate-500", value: "text-slate-900" },
  positif: { wrap: "bg-emerald-50", label: "text-emerald-700", value: "text-emerald-800" },
  attention: { wrap: "bg-amber-50", label: "text-amber-700", value: "text-amber-800" },
  alerte: { wrap: "bg-red-50", label: "text-red-700", value: "text-red-700" },
};

const VERDICT_STYLES: Record<VerdictNiveau, { chip: string; icon: typeof AlertTriangle }> = {
  alerte: { chip: "bg-red-50 text-red-700", icon: AlertTriangle },
  attention: { chip: "bg-amber-50 text-amber-700", icon: Info },
  positif: { chip: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
};

const BLOC_ICONS: Record<BlocKey, typeof Banknote> = {
  prix: Banknote,
  location: KeyRound,
  risque: ShieldAlert,
  potentiel: TrendingUp,
  quartier: MapPin,
  simulation: Calculator,
};

// Ordre d'affichage des 5 blocs notés, en grille 2 colonnes : Simulation
// financière est placée sous Prix d'achat et à côté de Potentiel (décision
// produit — les deux critères financiers les plus déterminants côte à côte).
// Le bloc "quartier" (non noté) est affiché séparément, en pleine largeur,
// après ceux-ci — voir plus bas.
const BLOC_ORDRE: BlocKey[] = ["prix", "location", "simulation", "potentiel", "risque"];

const GRAVITE_STYLES: Record<FaitGravite, { dot: string; value: string }> = {
  positif: { dot: "bg-emerald-500", value: "text-emerald-700" },
  info: { dot: "bg-slate-300", value: "text-slate-800" },
  attention: { dot: "bg-amber-500", value: "text-amber-700" },
  alerte: { dot: "bg-red-500", value: "text-red-600" },
};

function noteColorClasses(note: number): string {
  if (note >= 8) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (note >= 5) return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-red-50 text-red-700 ring-red-200";
}

export function formatNote(note: number): string {
  return note.toFixed(1).replace(".", ",");
}

/**
 * Phrase synthétique d'opportunité, dérivée du score et des verdicts (100 %
 * déterministe, disponible sans LLM). Mène sur le point rédhibitoire s'il
 * existe, sinon met en avant l'atout principal.
 */
function syntheseCourte(analyse: { score_global: number | null; verdicts: Verdict[]; blocs: Record<BlocKey, BlocAnalyse> }): string {
  const s = analyse.score_global;
  if (s == null) return "Analyse indisponible : données insuffisantes.";

  const qualifier =
    s >= 8 ? "Belle opportunité" : s >= 6 ? "Opportunité correcte" : s >= 4 ? "Opportunité limitée" : "Opportunité faible";

  const alerte = analyse.verdicts.find((v) => v.niveau === "alerte");
  if (alerte) return `${qualifier} — ${alerte.titre.toLowerCase()}.`;

  const attention = analyse.verdicts.find((v) => v.niveau === "attention");
  if (attention) return `${qualifier}, à nuancer : ${attention.titre.toLowerCase()}.`;

  // L'atout principal se cherche parmi les leviers de valeur (prix, location,
  // potentiel) — un bon score de risque = absence de problème, pas un atout.
  const leviers = (Object.values(analyse.blocs) as BlocAnalyse[]).filter(
    (b) => b.note != null && b.cle !== "risque"
  );
  const best = leviers.length ? leviers.reduce((a, b) => ((b.note as number) > (a.note as number) ? b : a)) : null;
  return best
    ? `${qualifier} — aucun point rédhibitoire, atout principal : ${best.titre.toLowerCase()} (${formatNote(best.note as number)}/10).`
    : `${qualifier}.`;
}

/** Rend un texte en interprétant le gras markdown **…** en <strong>. */
function renderBold(text: string): ReactNode {
  return text.split(/\*\*(.+?)\*\*/g).map((seg, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold text-slate-900">
        {seg}
      </strong>
    ) : (
      seg
    )
  );
}

export default function AnalyseIA({
  apartment,
  seuilsRendement = SEUILS_RENDEMENT_DEFAUT,
  onAnalysed,
}: {
  apartment: ApartmentWithComputed;
  seuilsRendement?: RendementSeuils;
  onAnalysed: (apt: ApartmentWithComputed) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Avis discret : les résumés IA ont échoué (quota Gemini) alors que les
  // données/scores, eux, ont bien été calculés.
  const [quotaNotice, setQuotaNotice] = useState(false);
  const analyse = apartment.analyse_ia;

  async function lancer() {
    setLoading(true);
    setError(null);
    setQuotaNotice(false);
    try {
      const res = await fetch(`/api/analyse/${apartment.id}`, { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        onAnalysed(data.apartment);
        setQuotaNotice(data.narrationStatus === "quota");
      } else {
        setError(data.error ?? "Échec de l'analyse.");
      }
    } catch {
      setError("Erreur réseau pendant l'analyse.");
    } finally {
      setLoading(false);
    }
  }

  // État initial : aucune analyse encore lancée.
  if (!analyse) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <Sparkles className="mx-auto h-8 w-8 text-indigo-500" />
        <h2 className="mt-3 text-lg font-semibold text-slate-900">Analyse IA</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          Une analyse fondée uniquement sur des données publiques réelles (ADEME, Géorisques,
          BAN…) : notes par bloc et score global, sans estimation inventée.
        </p>
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        <button
          onClick={lancer}
          disabled={loading}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-70"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {loading ? "Analyse en cours…" : "Lancer l'analyse"}
        </button>
        {loading && (
          <p className="mt-3 text-xs text-slate-400">
            Collecte des données réelles et rédaction — environ 30 s, ne quittez pas la page.
          </p>
        )}
      </div>
    );
  }

  // .filter(Boolean) : les analyses générées avant l'ajout d'un bloc (ex.
  // "simulation") ne l'ont pas encore en base — on l'omet sans planter,
  // jusqu'à ce que l'utilisateur clique sur « Relancer ».
  const blocsNotes = BLOC_ORDRE.map((k) => analyse.blocs[k]).filter((b): b is BlocAnalyse => b != null);
  // Quartier (non noté) est ajouté en dernier dans la même grille 2 colonnes,
  // pour s'afficher juste à côté de Risque (dernier bloc noté, seul sur sa ligne).
  const quartier = analyse.blocs.quartier;
  const blocs = quartier ? [...blocsNotes, quartier] : blocsNotes;

  return (
    <div className="space-y-6">
      {/* Score global + synthèse */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {/* Barre de progression indéterminée pendant l'analyse */}
        {loading && <div className="h-1 w-full animate-pulse bg-indigo-500" />}

        <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5">
            <ScoreGauge note={analyse.score_global} loading={loading} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Score global · opportunité d&apos;achat
              </p>
              <p className="mt-1 text-base font-medium leading-snug text-slate-800">
                {syntheseCourte(analyse)}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
            {loading ? (
              <span className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-indigo-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyse en cours… (~30 s)
              </span>
            ) : (
              <span className="whitespace-nowrap text-xs text-slate-400">
                Généré le {formatDateTime(analyse.genere_le)}
              </span>
            )}
            <button
              onClick={lancer}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              {loading ? "Analyse…" : "Relancer"}
            </button>
          </div>
        </div>

        {/* Alertes compactes (points forts / de vigilance) */}
        {analyse.verdicts && analyse.verdicts.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-6 py-3">
            {analyse.verdicts.map((v, i) => (
              <VerdictChip key={i} verdict={v} />
            ))}
          </div>
        )}

        {analyse.synthese && (
          <p className="border-t border-slate-100 px-6 py-4 text-sm leading-relaxed text-slate-700">
            {renderBold(analyse.synthese)}
          </p>
        )}

        {/* Avis discret : résumés IA indisponibles (quota Gemini) */}
        {quotaNotice && (
          <p className="flex items-start gap-1.5 border-t border-slate-100 px-6 py-3 text-xs text-amber-600">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Résumés IA temporairement indisponibles (quota gratuit atteint). Les scores et données
            chiffrées sont complets — réessayez dans quelques minutes, ou demain si le quota
            journalier est atteint.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {/* Blocs notés + Quartier (informatif, non noté), à côté de Risque */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {blocs.map((bloc) => (
          <BlocCard key={bloc.cle} bloc={bloc} apartment={apartment} seuilsRendement={seuilsRendement} />
        ))}
      </div>

      {/* Absent des analyses générées avant l'ajout du bloc Quartier — invite à relancer. */}
      {!quartier && (
        <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-center text-xs text-slate-400">
          Le bloc Quartier n&apos;existe pas encore pour cette analyse — clique sur « Relancer » pour le générer.
        </p>
      )}
    </div>
  );
}

function VerdictChip({ verdict }: { verdict: Verdict }) {
  const style = VERDICT_STYLES[verdict.niveau];
  const Icon = style.icon;
  return (
    <span
      title={verdict.detail}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${style.chip}`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {verdict.titre}
    </span>
  );
}

export function noteHex(note: number | null): string {
  if (note == null) return "#cbd5e1";
  if (note >= 8) return "#10b981";
  if (note >= 5) return "#f59e0b";
  return "#ef4444";
}

/** Jauge circulaire : anneau de progression proportionnel à la note /10. */
function ScoreGauge({ note, loading = false }: { note: number | null; loading?: boolean }) {
  const size = 96;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = note != null ? Math.max(0, Math.min(1, note / 10)) : 0;
  const color = noteHex(note);

  return (
    <div className={`relative shrink-0 ${loading ? "animate-pulse" : ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold leading-none" style={{ color }}>
          {note != null ? formatNote(note) : "—"}
        </span>
        <span className="text-[10px] text-slate-400">/ 10</span>
      </div>
    </div>
  );
}

function BlocCard({
  bloc,
  apartment,
  seuilsRendement,
}: {
  bloc: BlocAnalyse;
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
}) {
  const Icon = BLOC_ICONS[bloc.cle];
  // Le bloc "quartier" n'est pas noté et n'affiche pas de chiffres détaillés :
  // c'est une description en mots (voir narration.ts), pas une liste de faits.
  const isQuartier = bloc.cle === "quartier";

  return (
    <section className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Icon className="h-4 w-4 text-slate-400" />
          {bloc.titre}
        </h3>
        {bloc.note != null ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-sm font-semibold ring-1 ${noteColorClasses(
              bloc.note
            )}`}
          >
            {formatNote(bloc.note)}/10
          </span>
        ) : bloc.cle === "quartier" ? (
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-500">
            Informatif
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-400">
            À venir
          </span>
        )}
      </div>

      {!bloc.disponible ? (
        <p className="mt-4 text-sm text-slate-400">{bloc.messageIndisponible}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Résumé court, ou pour "quartier" : la description à part entière */}
          {bloc.narration ? (
            <p
              className={
                isQuartier
                  ? "text-[15px] leading-relaxed text-slate-700"
                  : "rounded-lg bg-slate-50 px-3 py-2 text-sm leading-relaxed text-slate-700"
              }
            >
              {renderBold(bloc.narration)}
            </p>
          ) : (
            isQuartier && (
              <p className="text-sm text-slate-400">
                Description indisponible pour cette analyse — clique sur « Relancer ».
              </p>
            )
          )}

          {/* Échelles DPE / GES (bloc Risques) */}
          {bloc.dpeGes && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <EnergyScale label="DPE (énergie)" value={bloc.dpeGes.dpe} palette={DPE_COLORS} />
              <EnergyScale label="GES (climat)" value={bloc.dpeGes.ges} palette={GES_COLORS} />
            </div>
          )}

          {/* Métriques mises en avant (ex. rendement brut / net) */}
          {bloc.highlights && bloc.highlights.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {bloc.highlights.map((h, i) => (
                <HighlightCard key={i} highlight={h} apartment={apartment} seuilsRendement={seuilsRendement} />
              ))}
            </div>
          )}

          {/* Données structurées — pas pour "quartier", qui reste une description */}
          {!isQuartier && (
            <ul className="divide-y divide-slate-100">
              {bloc.faits.map((f, i) => (
                <FaitRow key={i} fait={f} />
              ))}
            </ul>
          )}

          {/* Données manquantes (jamais estimées) */}
          {!isQuartier && bloc.donneesManquantes && bloc.donneesManquantes.length > 0 && (
            <p className="text-xs text-slate-400">
              Donnée(s) non disponible(s), non estimée(s) : {bloc.donneesManquantes.join(" · ")}.
            </p>
          )}

          {bloc.sources.length > 0 && (
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              Sources :{" "}
              {bloc.sources.map((s, i) => (
                <span key={s.label}>
                  {i > 0 && " · "}
                  {s.url ? (
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline hover:text-slate-600">
                      {s.label}
                    </a>
                  ) : (
                    s.label
                  )}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const LETTERS = ["A", "B", "C", "D", "E", "F", "G"] as const;
// bg / text par classe — vert→rouge pour le DPE (énergie), dégradé violet pour le GES (climat).
const DPE_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: "#2f9e44", text: "#fff" },
  B: { bg: "#66a80f", text: "#fff" },
  C: { bg: "#a9c92f", text: "#1f2937" },
  D: { bg: "#f2c811", text: "#1f2937" },
  E: { bg: "#f08c00", text: "#fff" },
  F: { bg: "#e8590c", text: "#fff" },
  G: { bg: "#e03131", text: "#fff" },
};
const GES_COLORS: Record<string, { bg: string; text: string }> = {
  A: { bg: "#efe6fb", text: "#4c1d95" },
  B: { bg: "#d9c2f0", text: "#4c1d95" },
  C: { bg: "#c19ee6", text: "#3b0764" },
  D: { bg: "#a97fd9", text: "#fff" },
  E: { bg: "#9256c9", text: "#fff" },
  F: { bg: "#7c3aed", text: "#fff" },
  G: { bg: "#6021a8", text: "#fff" },
};

/** Échelle colorée A→G avec la classe active mise en avant (popped). */
function EnergyScale({ label, value, palette }: { label: string; value: string; palette: Record<string, { bg: string; text: string }> }) {
  const active = (value || "").toUpperCase();
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex items-center gap-0.5">
        {LETTERS.map((l) => {
          const c = palette[l];
          const isActive = l === active;
          return (
            <div
              key={l}
              style={{ backgroundColor: c.bg, color: c.text }}
              className={
                isActive
                  ? "z-10 -my-1 flex h-10 w-10 items-center justify-center rounded-lg text-base font-bold shadow-md ring-2 ring-white"
                  : "flex h-7 flex-1 items-center justify-center text-xs font-semibold opacity-70 first:rounded-l last:rounded-r"
              }
            >
              {l}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HighlightCard({
  highlight,
  apartment,
  seuilsRendement,
}: {
  highlight: BlocHighlight;
  apartment: ApartmentWithComputed;
  seuilsRendement: RendementSeuils;
}) {
  const { open: openRendementDetail } = useRendementDetail();
  const t = HIGHLIGHT_TONES[highlight.tone];
  const content = (
    <>
      <p className={`text-xs ${t.label}`}>{highlight.label}</p>
      <p className={`mt-1 text-2xl font-bold ${t.value}`}>{highlight.value}</p>
    </>
  );

  if (!HIGHLIGHTS_RENDEMENT.has(highlight.label)) {
    return <div className={`rounded-lg p-4 ${t.wrap}`}>{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={() => openRendementDetail(apartment, seuilsRendement)}
      title="Voir le détail du calcul"
      className={`rounded-lg p-4 text-left transition ${RENDEMENT_HOVER_RING[highlight.tone]} ${t.wrap}`}
    >
      {content}
    </button>
  );
}

function FaitRow({ fait }: { fait: Fait }) {
  const style = GRAVITE_STYLES[fait.gravite ?? "info"];
  const hasValue = fait.value != null && fait.value !== "";

  return (
    <li className="flex items-start justify-between gap-3 py-2">
      <div className="flex min-w-0 flex-1 gap-2">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {fait.label}
            {fait.perimetre && (
              <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
                {fait.perimetre}
              </span>
            )}
          </p>
          {fait.detail && <p className="text-xs leading-snug text-slate-500">{fait.detail}</p>}
        </div>
      </div>
      {hasValue && (
        <div className={`max-w-[45%] shrink-0 text-right text-base font-semibold ${style.value}`}>
          {fait.value}
          {fait.unit && <span className="ml-0.5 text-xs font-normal opacity-70">{fait.unit}</span>}
        </div>
      )}
    </li>
  );
}
