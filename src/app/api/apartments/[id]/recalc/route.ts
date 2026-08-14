import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { reponseErreur } from "../../../erreurs";
import { checkAndIncrementAnalyseQuota, requireApartment, updateApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { patchLocalisation, runAnalyse } from "@/lib/analyse/run";
import { computeRecalcNeeds } from "@/lib/recalc";
import { appliquerPatch } from "@/lib/patchApartment";
import { reestimerAssurance, reestimerCharges, reestimerLoyer } from "@/lib/reestimation";
import { apartmentPatchSchema } from "@/lib/types";
import type { AnalyseIA } from "@/lib/analyse/types";

/**
 * Enregistre une modification du bien PUIS rejoue tout ce qu'elle impacte, en
 * une seule requête : charges → loyer → assurance → Analyse IA.
 *
 * Le client menait cette chaîne lui-même, en six allers-retours successifs
 * (PATCH, charges, loyer, GET, PATCH assurance, analyse) dont chacun
 * re-sérialisait le bien entier. L'ordre des étapes, lui, n'a pas changé et
 * reste contraint : le loyer lit les charges (voir `reestimation.ts`), et
 * l'analyse doit voir loyer et charges à jour pour noter le rendement.
 *
 * Seules les étapes réellement impactées tournent (`computeRecalcNeeds`, table
 * de champs partagée avec le client, qui allume ses skeletons sur la même
 * base).
 *
 * ⚠️ Chaque étape repart de la ligne renvoyée par la précédente, jamais de
 * `apartment` : une étape qui lirait le bien d'avant recalculerait sur des
 * valeurs périmées.
 */
export async function POST(req: NextRequest, { params }: RouteContext<"/api/apartments/[id]/recalc">) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = apartmentPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const patch = parsed.data;
    const needs = computeRecalcNeeds(patch);

    // ⚠️ Ordre imposé : le bien D'ABORD, le quota ENSUITE.
    //
    // Le quota doit être débité avant la première écriture — une chaîne qui
    // buterait sur le quota à son dernier maillon laisserait le bien ré-estimé
    // et son analyse périmée, sans rien pour le signaler. Mais le débiter avant
    // de savoir que le bien existe facturait une analyse à un simple 404
    // (constaté en testant cette route sur un identifiant inconnu).
    let apartment = await requireApartment(id);
    if (needs.analysis) await checkAndIncrementAnalyseQuota();
    // ⚠️ `appliquerPatch`, pas `updateApartment` : le patch venant d'un
    // formulaire, il doit passer par les mêmes effets de bord que la route
    // PATCH (badges « estimé », re-géocodage si l'adresse change, suivi du
    // montant emprunté si le prix change). Un recalcul déclenché par un
    // changement d'adresse aurait sinon analysé le bien à son ANCIENNE
    // position.
    if (Object.keys(patch).length > 0) apartment = await appliquerPatch(id, patch, apartment);

    if (needs.charges) apartment = await reestimerCharges(apartment);
    if (needs.rent) apartment = await reestimerLoyer(apartment);
    if (needs.assurance) apartment = await reestimerAssurance(apartment);

    let narrationStatus: string | undefined;
    if (needs.analysis) {
      const resultat = await runAnalyse(apartment);
      narrationStatus = resultat.narrationStatus;
      const analyse: AnalyseIA = resultat.analyse;
      apartment = await updateApartment(id, {
        analyse_ia: analyse,
        ...patchLocalisation(apartment, resultat.localisation),
      });
    }

    revalidatePath("/");
    return NextResponse.json({ apartment: computeDerived(apartment), narrationStatus });
  } catch (err) {
    return reponseErreur(err);
  }
}
