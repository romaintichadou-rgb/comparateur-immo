import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { deleteApartment, getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import {
  CHAMPS_ESTIMABLES,
  ChampEstimable,
  apartmentPatchSchema,
  type ApartmentPatch,
} from "@/lib/types";
import { geocodeApartmentLocation } from "@/lib/geocoding";
import { capitalEffectif } from "@/lib/simulation";

// Champs dont dépend le géocodage : les coordonnées de la carte ne sont
// calculées qu'à la création (voir POST /api/apartments). Un bien importé
// sans adresse précise (ex. Leboncoin ne l'affiche pas publiquement) est
// alors géocodé au niveau du quartier ; si l'adresse exacte est renseignée
// plus tard ici, il faut re-géocoder, sinon le pin reste bloqué sur
// l'ancienne position approximative malgré l'adresse à jour.
const CHAMPS_LOCALISATION = ["adresse", "quartier", "ville", "code_postal"] as const;

// Champs qui changent le COÛT TOTAL de l'opération, donc le plan de financement.
const CHAMPS_COUT_OPERATION = ["prix", "travaux", "frais_notaire_estimes"] as const;

/**
 * Fait suivre un montant emprunté FIGÉ quand le coût de l'opération change.
 *
 * En mode auto (`montantEmprunte == null`), l'emprunt suit déjà le prix : rien
 * à faire. Mais dès que l'utilisateur saisit un montant, celui-ci est stocké en
 * ABSOLU — changer le prix d'achat ensuite laissait un emprunt calibré sur
 * l'ancien prix, donc une mensualité, un impôt et un cash-flow faux, sans le
 * moindre signal.
 *
 * On garde l'APPORT constant et on répercute l'écart sur l'emprunt : c'est ce
 * que l'utilisateur a réellement décidé en figeant le champ (« je mets tant de
 * ma poche »), et c'est déjà la convention du moteur de recommandations, qui
 * répercute une négociation de prix sur le capital à apport inchangé.
 *
 * Placé ici, dans la route PATCH, et non dans le formulaire : c'est le passage
 * obligé de TOUTE modification du bien, quel que soit l'écran d'origine.
 */
function suivreMontantEmprunte(
  current: Parameters<typeof computeDerived>[0],
  patch: ApartmentPatch
): ApartmentPatch {
  const inputs = current.simulation_inputs;
  const capital = inputs?.montantEmprunte;
  if (inputs == null || capital == null) return {}; // mode auto : déjà dérivé
  if (patch.simulation_inputs !== undefined) return {}; // l'appelant pilote le plan lui-même
  if (!CHAMPS_COUT_OPERATION.some((k) => k in patch)) return {};

  const avant = computeDerived(current).budget_total;
  const apres = computeDerived({ ...current, ...patch }).budget_total;
  if (avant == null || apres == null || avant === apres) return {};

  // On repart du capital EFFECTIF, pas du montant stocké : s'il était déjà
  // incohérent (figé à un prix supérieur), lui appliquer l'écart propagerait
  // la base fausse. Passer par le plafond partagé de `simulate` répare la
  // valeur en base au premier changement de prix.
  const effectif = capitalEffectif(capital, avant, avant);
  return {
    simulation_inputs: {
      ...inputs,
      montantEmprunte: Math.max(0, Math.round(effectif + (apres - avant))),
    },
  };
}

export async function GET(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  const apartment = await getApartment(id);
  if (!apartment) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ apartment: computeDerived(apartment) });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  try {
    const current = await getApartment(id);
    if (!current) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = apartmentPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const patch = parsed.data;

    // Toute modification manuelle d'un champ estimable désactive
    // définitivement son badge "estimé" (pas de réestimation automatique
    // future), sauf si le patch fournit explicitement champs_manuels
    // (ex: bouton "réestimer" qui remet un champ en mode estimé).
    let champsManuels: ChampEstimable[];
    if (patch.champs_manuels !== undefined) {
      champsManuels = patch.champs_manuels;
    } else {
      const nouveauxChampsManuels = (Object.keys(patch) as (keyof typeof patch)[])
        .filter((key): key is ChampEstimable =>
          (CHAMPS_ESTIMABLES as readonly string[]).includes(key)
        )
        .filter((key) => patch[key] !== current[key]);
      champsManuels = Array.from(
        new Set([...current.champs_manuels, ...nouveauxChampsManuels])
      );
    }

    const localisationChangee = CHAMPS_LOCALISATION.some(
      (key) => key in patch && patch[key] !== current[key]
    );

    let geoPatch: ApartmentPatch = {};
    if (localisationChangee) {
      try {
        const merged = { ...current, ...patch };
        const geo = await geocodeApartmentLocation({
          adresse: merged.adresse,
          quartier: merged.quartier,
          ville: merged.ville,
          code_postal: merged.code_postal,
        });
        if (geo) {
          geoPatch = {
            latitude: geo.latitude,
            longitude: geo.longitude,
            precision_localisation: geo.precision_localisation,
            code_insee: geo.code_insee,
          };
        }
      } catch {
        // Best-effort : la localisation reste inchangée en cas d'échec.
      }
    }

    const updated = await updateApartment(id, {
      ...patch,
      ...suivreMontantEmprunte(current, patch),
      ...geoPatch,
      champs_manuels: champsManuels,
    });

    revalidatePath("/");
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  try {
    await deleteApartment(id);
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
