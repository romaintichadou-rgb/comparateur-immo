import { NextRequest, NextResponse } from "next/server";
import { reponseErreur } from "../erreurs";
import { NonAuthentifieError } from "@/lib/auth";
import { ApartmentIntrouvableError, requireApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { reestimerCharges } from "@/lib/reestimation";
import type { ChargesField } from "@/lib/chargesEstimation";

const VALID_FIELDS: ChargesField[] = ["charges_copro_annuelles", "taxe_fonciere"];

/**
 * Ré-estime les charges d'UN bien — les deux champs, ou celui passé en
 * `field`. Corps métier dans `reestimation.ts`, partagé avec le recalcul en
 * chaîne (`/api/apartments/[id]/recalc`).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const apartmentId = typeof body?.apartmentId === "string" ? body.apartmentId : "";
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId manquant" }, { status: 400 });
  }

  // Champ validé contre la liste : un paramètre libre ferait écrire une
  // colonne arbitraire du bien.
  const field: ChargesField | undefined =
    typeof body?.field === "string" && VALID_FIELDS.includes(body.field as ChargesField)
      ? (body.field as ChargesField)
      : undefined;

  try {
    const apartment = await requireApartment(apartmentId);
    const updated = await reestimerCharges(apartment, field, true);
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    // Avant le message générique : un utilisateur déconnecté ne doit pas lire
    // un diagnostic de clé Gemini (voir estimate-rent).
    if (err instanceof NonAuthentifieError || err instanceof ApartmentIntrouvableError) {
      return reponseErreur(err);
    }

    console.error("estimate-charges failed:", err);
    const message =
      err instanceof Error && err.message.includes("GEMINI_API_KEY manquant")
        ? err.message
        : "Estimation des charges indisponible pour le moment (clé Gemini invalide, quota atteint, ou service momentanément indisponible). Vérifie GEMINI_API_KEY dans .env.local, ou réessaie plus tard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
