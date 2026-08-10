import { NextRequest, NextResponse } from "next/server";
import { reponseErreur } from "../erreurs";
import { requireApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { reestimerAssurance } from "@/lib/reestimation";

/**
 * Ré-estime la prime d'assurance PNO d'un bien.
 *
 * Aucun appel IA — le calcul est déterministe (`estimateAssurance`). Cette
 * route existe quand même, pour que les quatre champs estimables de la fiche
 * suivent le MÊME chemin : le client calculait l'assurance lui-même puis
 * PATCHait le bien avec ses propres listes `champs_manuels` /
 * `champs_estimes_ia`, seule valeur du bien à être écrite depuis le navigateur
 * — une troisième copie de cette bascule, à côté des routes loyer et charges.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const apartmentId = typeof body?.apartmentId === "string" ? body.apartmentId : "";
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId manquant" }, { status: 400 });
  }

  try {
    const apartment = await requireApartment(apartmentId);
    const updated = await reestimerAssurance(apartment);
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    return reponseErreur(err);
  }
}
