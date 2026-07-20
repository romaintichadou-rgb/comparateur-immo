import { NextRequest, NextResponse } from "next/server";
import { getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { estimateCharges, type ChargesField } from "@/lib/chargesEstimation";
import { getTauxCommune } from "@/lib/taxeFonciereCommune";
import type { ChampEstimable } from "@/lib/types";

const VALID_FIELDS: ChargesField[] = ["charges_copro_annuelles", "taxe_fonciere"];

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apartmentId = typeof body?.apartmentId === "string" ? body.apartmentId : "";
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId manquant" }, { status: 400 });
  }

  const field: ChargesField | undefined =
    typeof body?.field === "string" && VALID_FIELDS.includes(body.field as ChargesField)
      ? (body.field as ChargesField)
      : undefined;

  const apartment = await getApartment(apartmentId);
  if (!apartment) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  try {
    const result = await estimateCharges({
      ville: apartment.ville,
      quartier: apartment.quartier,
      code_postal: apartment.code_postal,
      type_bien: apartment.type_bien,
      surface_m2: apartment.surface_m2,
      nb_lots: apartment.nb_lots,
      annee_construction: apartment.annee_construction,
      ascenseur: apartment.ascenseur,
      etat_bien: apartment.etat_bien,
      prix: apartment.prix,
      code_insee: apartment.code_insee,
    }, field);

    const hasTauxCommune = apartment.code_insee != null && getTauxCommune(apartment.code_insee) != null;

    const wantCopro = field !== "taxe_fonciere";
    const wantTf = field !== "charges_copro_annuelles";

    // Build the update patch — only touch the requested field(s).
    const patch: Record<string, unknown> = {};

    if (wantCopro) {
      patch.charges_copro_annuelles = result.chargesCoproAnnuelles;
      patch.charges_justification = result.chargesJustification;
    }
    if (wantTf) {
      patch.taxe_fonciere = result.taxeFonciere;
      patch.taxe_fonciere_justification = result.taxeJustification;
    }

    // Update champs_manuels / champs_estimes_ia for the touched fields only.
    const touchedFields: ChampEstimable[] = [];
    if (wantCopro) touchedFields.push("charges_copro_annuelles");
    if (wantTf) touchedFields.push("taxe_fonciere");

    const champsManuels = apartment.champs_manuels.filter(
      (c) => !touchedFields.includes(c)
    );

    const iaFields: ChampEstimable[] = touchedFields.filter(
      (f) => !(f === "taxe_fonciere" && hasTauxCommune)
    );
    const champsEstimesIa: ChampEstimable[] = Array.from(
      new Set([
        ...apartment.champs_estimes_ia.filter((c) =>
          hasTauxCommune && c === "taxe_fonciere" ? false : !touchedFields.includes(c) || iaFields.includes(c)
        ),
        ...iaFields,
      ])
    );

    patch.champs_manuels = champsManuels;
    patch.champs_estimes_ia = champsEstimesIa;

    const updated = await updateApartment(apartmentId, patch);
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    console.error("estimate-charges failed:", err);
    const message =
      err instanceof Error && err.message.includes("GEMINI_API_KEY manquant")
        ? err.message
        : "Estimation des charges indisponible pour le moment (clé Gemini invalide, quota atteint, ou service momentanément indisponible). Vérifie GEMINI_API_KEY dans .env.local, ou réessaie plus tard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
