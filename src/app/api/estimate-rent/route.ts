import { NextRequest, NextResponse } from "next/server";
import { getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { estimateRent } from "@/lib/rentEstimation";
import { fetchLoyerReference } from "@/lib/analyse/sources/loyers";
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
    // Charges ACTUELLEMENT retenues pour ce bien (formule déterministe, IA,
    // ou saisie manuelle — computeDerived applique déjà cette priorité) :
    // sert de base à la provision HC→CC du prompt, pour rester cohérent avec
    // ce qu'affiche la section "Charges annuelles" au lieu d'une moyenne
    // générique déconnectée du bien (voir buildConsigneCharges).
    const chargesCoproAnnuelles = computeDerived(apartment).charges_copro_annuelles;

    const loyerRef = apartment.code_insee
      ? await fetchLoyerReference(apartment.code_insee)
      : null;

    const { loyer, justification } = await estimateRent({
      ville: apartment.ville,
      quartier: apartment.quartier,
      code_postal: apartment.code_postal,
      surface_m2: apartment.surface_m2,
      nb_pieces: apartment.nb_pieces,
      nb_chambres: apartment.nb_chambres,
      type_bien: apartment.type_bien,
      nb_lots: apartment.nb_lots,
      charges_copro_annuelles: chargesCoproAnnuelles,
      etage: apartment.etage,
      ascenseur: apartment.ascenseur,
      annee_construction: apartment.annee_construction,
      etat_bien: apartment.etat_bien,
      dpe: apartment.dpe,
      ges: apartment.ges,
      travaux: apartment.travaux,
      description: apartment.description,
    }, loyerRef);

    // Ceci est l'action explicite "réestimer" : on écrase loyer_retenu même
    // s'il avait été marqué manuel, et on le (re)marque comme estimé par IA
    // (voir isAiEstimated dans estimates.ts) — même mécanique que
    // /api/estimate-charges pour charges_copro_annuelles/taxe_fonciere.
    const champsManuels = apartment.champs_manuels.filter((c) => c !== "loyer_retenu");
    const champsEstimesIa: ChampEstimable[] = Array.from(
      new Set([...apartment.champs_estimes_ia, "loyer_retenu"] as const)
    );

    const updated = await updateApartment(apartmentId, {
      loyer_retenu: loyer,
      loyer_justification: justification,
      champs_manuels: champsManuels,
      champs_estimes_ia: champsEstimesIa,
    });

    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    // Ne jamais renvoyer un message d'erreur brut (SDK Gemini, JSON d'erreur
    // Google...) tel quel au client : loggé côté serveur pour le debug, mais
    // seul un message clair et actionnable est montré à l'utilisateur. Le
    // message "clé manquante" de rentEstimation.ts reste tel quel (déjà
    // clair et actionnable), tout le reste est uniformisé.
    console.error("estimate-rent failed:", err);
    const message =
      err instanceof Error && err.message.includes("GEMINI_API_KEY manquant")
        ? err.message
        : "Estimation du loyer indisponible pour le moment (clé Gemini invalide, quota atteint, ou service momentanément indisponible). Vérifie GEMINI_API_KEY dans .env.local, ou réessaie plus tard.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
