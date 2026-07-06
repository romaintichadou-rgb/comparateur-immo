import { NextRequest, NextResponse } from "next/server";
import { getApartment, updateApartment } from "@/lib/sheets";
import { computeDerived } from "@/lib/calculations";
import { runAnalyse } from "@/lib/analyse/run";

/**
 * Lance (ou relance) l'Analyse IA d'un bien : géocode via BAN, interroge les
 * sources de données réelles, calcule les notes déterministes, fait rédiger la
 * narration, puis stocke le résultat (colonne analyse_ia) et le code INSEE
 * éventuellement récupéré. Renvoie l'appartement à jour.
 */
export async function POST(
  _req: NextRequest,
  { params }: RouteContext<"/api/analyse/[id]">
) {
  const { id } = await params;
  try {
    const apartment = await getApartment(id);
    if (!apartment) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const { analyse, codeInsee, narrationStatus } = await runAnalyse(apartment);

    const updated = await updateApartment(id, {
      analyse_ia: analyse,
      // On persiste le code INSEE si le géocodage BAN vient de le trouver
      // (utile aux futurs blocs DVF / délinquance / loyers).
      ...(codeInsee && codeInsee !== apartment.code_insee ? { code_insee: codeInsee } : {}),
    });

    // narrationStatus est transitoire (non stocké) : sert à informer l'UI si
    // les résumés IA ont échoué (ex. quota Gemini), sans bloquer l'analyse.
    return NextResponse.json({ apartment: computeDerived(updated), narrationStatus });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
