import { NextRequest, NextResponse } from "next/server";
import { getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { estimateRent } from "@/lib/rentEstimation";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const apartmentId = typeof body?.apartmentId === "string" ? body.apartmentId : "";
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId manquant" }, { status: 400 });
  }

  const apartment = await getApartment(apartmentId);
  if (!apartment) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  try {
    const { loyer, justification } = await estimateRent({
      ville: apartment.ville,
      quartier: apartment.quartier,
      code_postal: apartment.code_postal,
      surface_m2: apartment.surface_m2,
      nb_pieces: apartment.nb_pieces,
      type_bien: apartment.type_bien,
    });

    // Ceci est l'action explicite "réestimer" : on écrase loyer_retenu même
    // s'il avait été marqué manuel, et on ré-affiche son badge "estimé".
    const champsManuels = apartment.champs_manuels.filter((c) => c !== "loyer_retenu");

    const updated = await updateApartment(apartmentId, {
      loyer_retenu: loyer,
      loyer_justification: justification,
      champs_manuels: champsManuels,
    });

    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
