import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { reponseErreur } from "../../erreurs";
import { checkAndIncrementAnalyseQuota, requireApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { runAnalyse } from "@/lib/analyse/run";

/**
 * Lance (ou relance) l'Analyse IA d'un bien : géocode via BAN, interroge les
 * sources de données réelles, calcule les notes déterministes, fait rédiger la
 * narration, puis stocke le résultat (colonne `analyse_ia`) et le code INSEE
 * éventuellement récupéré. Renvoie l'appartement à jour.
 *
 * Ne touche NI au loyer NI aux charges : les ré-estimer relève du recalcul en
 * chaîne (`/api/apartments/[id]/recalc`), déclenché par une modification du
 * bien. Ici, l'utilisateur demande une nouvelle lecture des mêmes données.
 */
export async function POST(_req: NextRequest, { params }: RouteContext<"/api/analyse/[id]">) {
  const { id } = await params;
  try {
    // Quota vérifié avant l'appel Gemini — et avant toute écriture.
    await checkAndIncrementAnalyseQuota();

    const apartment = await requireApartment(id);
    const { analyse, codeInsee, narrationStatus } = await runAnalyse(apartment);

    const updated = await updateApartment(id, {
      analyse_ia: analyse,
      ...(codeInsee && codeInsee !== apartment.code_insee ? { code_insee: codeInsee } : {}),
    });

    // `narrationStatus` est transitoire (non stocké) : sert à informer l'UI si
    // les résumés IA ont échoué (ex. quota Gemini), sans bloquer l'analyse.
    revalidatePath("/");
    return NextResponse.json({ apartment: computeDerived(updated), narrationStatus });
  } catch (err) {
    return reponseErreur(err);
  }
}
