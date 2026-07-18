import { NextRequest, NextResponse } from "next/server";
import { getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { estimateCharges } from "@/lib/chargesEstimation";
import type { ChampEstimable } from "@/lib/types";

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
    const { chargesCoproAnnuelles, chargesJustification, taxeFonciere, taxeJustification } =
      await estimateCharges({
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
      });

    // Ceci est l'action explicite "réestimer" : on écrase les deux champs
    // même s'ils avaient été marqués manuels, et on les (re)marque comme
    // estimés par IA — applyLiveEstimates arrêtera de les recalculer par la
    // formule déterministe tant qu'ils y restent (voir estimates.ts).
    const champsManuels = apartment.champs_manuels.filter(
      (c) => c !== "charges_copro_annuelles" && c !== "taxe_fonciere"
    );
    const champsEstimesIa: ChampEstimable[] = Array.from(
      new Set([...apartment.champs_estimes_ia, "charges_copro_annuelles", "taxe_fonciere"] as const)
    );

    const updated = await updateApartment(apartmentId, {
      charges_copro_annuelles: chargesCoproAnnuelles,
      charges_justification: chargesJustification,
      taxe_fonciere: taxeFonciere,
      taxe_fonciere_justification: taxeJustification,
      champs_manuels: champsManuels,
      champs_estimes_ia: champsEstimesIa,
    });

    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    // Voir la même règle dans /api/estimate-rent : ne jamais renvoyer un
    // message d'erreur brut (SDK Gemini, JSON d'erreur Google...) au client.
    console.error("estimate-charges failed:", err);
    const message =
      err instanceof Error && err.message.includes("GEMINI_API_KEY manquant")
        ? err.message
        : "Estimation des charges indisponible pour le moment (clé Gemini invalide, quota atteint, ou service momentanément indisponible). Vérifie GEMINI_API_KEY dans .env.local, ou réessaie plus tard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
