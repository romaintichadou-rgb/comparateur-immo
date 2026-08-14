import { NextRequest, NextResponse } from "next/server";
import { fetchLoyerRef } from "@/lib/analyse/sources/loyers";
import { perimetreAnalyse } from "@/lib/analyse/perimetre";
import { requireApartment } from "@/lib/db";
import type { TypologieAnil } from "@/lib/anilReference";
import { reponseErreur } from "../erreurs";

/**
 * Référence de loyer ANIL d'un bien, pour les écrans qui l'EXPLIQUENT
 * (`LoyerDetailPanel`, `PlaygroundView`) — pas pour la calculer.
 *
 * ⚠️ **Le paramètre est `apartment_id`, pas `code_insee`.** La référence ne se
 * déduit plus d'une commune seule : `perimetreAnalyse` peut agréger plusieurs
 * communes quand la position vaut au moins la voie (voir `analyse/perimetre.ts`).
 * Tant que cette route lisait la ligne communale pendant que l'analyse et
 * `/api/estimate-rent` agrégeaient, le panneau affichait des chiffres qui
 * pouvaient contredire l'estimation qu'il est censé expliquer — sur un bien
 * proche d'une limite communale.
 *
 * La localisation est relue en base plutôt que reçue du client : c'est la seule
 * façon de garantir les mêmes entrées que l'analyse, et cela évite de faire
 * transiter des coordonnées par une query string.
 *
 * ⚠️ `typologie` reste un paramètre CLIENT : le panneau peut afficher une
 * projection (recommandation, playground) dont la surface ou le nombre de
 * pièces diffèrent du bien stocké, et donc la ressource ANIL lue.
 *
 * Protection : `requireApartment` passe par `db.ts`, donc `requireSession()` +
 * filtre `user_id`. Plus besoin du `getApiSession()` manuel qu'exigeait la
 * version précédente, qui n'appelait pas le DAL.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("apartment_id");
  if (!id) {
    return NextResponse.json({ error: "apartment_id manquant" }, { status: 400 });
  }

  // La typologie décide de la ressource ANIL lue (maison / T1-T2 / T3+ /
  // générique). Validée contre la liste : un paramètre libre choisirait un
  // fichier arbitraire côté source.
  const brut = req.nextUrl.searchParams.get("typologie");
  const typologie: TypologieAnil =
    brut === "maison" || brut === "appartement_t1_t2" || brut === "appartement_t3_plus"
      ? brut
      : "appartement";

  try {
    const apt = await requireApartment(id);
    const perimetre = perimetreAnalyse({
      lat: apt.latitude,
      lon: apt.longitude,
      codeInsee: apt.code_insee,
      precision: apt.precision_localisation,
    });
    const data = perimetre ? await fetchLoyerRef(perimetre, typologie) : null;
    return NextResponse.json({
      ref: data?.ref ?? null,
      typologie,
      // Le périmètre réellement agrégé, comme le rendent les blocs d'analyse —
      // l'écran qui explique un chiffre doit pouvoir dire d'où il vient.
      perimetreLabel: data?.perimetreLabel ?? null,
    });
  } catch (err) {
    return reponseErreur(err);
  }
}
