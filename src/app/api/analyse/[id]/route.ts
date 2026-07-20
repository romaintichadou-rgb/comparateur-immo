import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { isAiEstimated } from "@/lib/estimates";
import { estimateRent } from "@/lib/rentEstimation";
import { fetchLoyerReference } from "@/lib/analyse/sources/loyers";
import { runAnalyse } from "@/lib/analyse/run";
import type { ChampEstimable } from "@/lib/types";

/**
 * Lance (ou relance) l'Analyse IA d'un bien : ré-estime le loyer (s'il est
 * d'origine IA) pour rester cohérent, géocode via BAN, interroge les sources
 * de données réelles, calcule les notes déterministes, fait rédiger la
 * narration, puis stocke le résultat (colonne analyse_ia) et le code INSEE
 * éventuellement récupéré. Renvoie l'appartement à jour.
 */
export async function POST(
  _req: NextRequest,
  { params }: RouteContext<"/api/analyse/[id]">
) {
  const { id } = await params;
  try {
    let apartment = await getApartment(id);
    if (!apartment) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    if (isAiEstimated(apartment, "loyer_retenu")) {
      try {
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

        if (loyer != null) {
          const champsEstimesIa: ChampEstimable[] = Array.from(
            new Set([...apartment.champs_estimes_ia, "loyer_retenu"] as const)
          );
          apartment = await updateApartment(id, {
            loyer_retenu: loyer,
            loyer_justification: justification,
            champs_estimes_ia: champsEstimesIa,
          });
        }
      } catch {
        // Estimation échouée — on continue avec le loyer existant.
      }
    }

    const { analyse, codeInsee, narrationStatus } = await runAnalyse(apartment);

    const updated = await updateApartment(id, {
      analyse_ia: analyse,
      ...(codeInsee && codeInsee !== apartment.code_insee ? { code_insee: codeInsee } : {}),
    });

    // narrationStatus est transitoire (non stocké) : sert à informer l'UI si
    // les résumés IA ont échoué (ex. quota Gemini), sans bloquer l'analyse.
    revalidatePath("/");
    return NextResponse.json({ apartment: computeDerived(updated), narrationStatus });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
