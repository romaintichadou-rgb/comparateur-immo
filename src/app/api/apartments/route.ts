import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createApartment, listApartments } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { apartmentInputSchema, isImmeuble, type ChampEstimable } from "@/lib/types";
import {
  estimateAssurance,
  estimateChargesCopro,
  estimateFraisNotaire,
} from "@/lib/estimates";
import { estimateTaxeFonciereCommune } from "@/lib/taxeFonciereCommune";
import { geocodeApartmentLocation } from "@/lib/geocoding";

export async function GET() {
  try {
    const apartments = await listApartments();
    const withComputed = apartments.map(computeDerived);
    return NextResponse.json({ apartments: withComputed });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = apartmentInputSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", issues: parsed.error.issues },
        { status: 400 }
      );
    }

    const input = parsed.data;

    // Pré-remplissage des champs estimables non renseignés par l'utilisateur,
    // le parser ou le bookmarklet. Seuls les champs réellement calculés par
    // une heuristique/IA ici portent le badge "estimé" — une valeur trouvée
    // dans l'annonce (extraite) ou saisie par l'utilisateur est un fait, pas
    // une estimation, même si elle atterrit dans le même champ de la Sheet.
    const champsManuelsAtCreation: ChampEstimable[] = (
      [
        "frais_notaire_estimes",
        "taxe_fonciere",
        "charges_copro_annuelles",
        "assurance_annuelle",
        "loyer_retenu",
      ] as const
    ).filter((key) => input[key] != null);

    const fraisNotaire =
      input.frais_notaire_estimes ??
      estimateFraisNotaire(input.prix, input.etat_bien);
    const chargesCopro = input.charges_copro_annuelles ?? estimateChargesCopro(
      input.surface_m2, isImmeuble(input.type_bien), input.code_postal,
    );
    const assuranceAnnuelle = input.assurance_annuelle ?? estimateAssurance(
      isImmeuble(input.type_bien), input.nb_lots, input.surface_m2, input.type_bien,
    );

    let latitude = input.latitude;
    let longitude = input.longitude;
    let precision = input.precision_localisation;
    let codeInsee = input.code_insee;
    // On géocode via BAN si les coordonnées manquent, OU si le code INSEE
    // manque encore (clé de jointure indispensable pour l'Analyse IA) : BAN
    // le renvoie gratuitement en même temps que les coordonnées.
    if (latitude == null || longitude == null || !codeInsee) {
      try {
        const geo = await geocodeApartmentLocation(input);
        if (geo) {
          latitude = geo.latitude;
          longitude = geo.longitude;
          precision = geo.precision_localisation;
          codeInsee = geo.code_insee;
        }
      } catch {
        // Le géocodage est un confort (carte), jamais bloquant pour l'ajout.
      }
    }

    // TF estimée APRÈS géocodage pour bénéficier du taux communal réel
    const taxeFonciere = input.taxe_fonciere ?? estimateTaxeFonciereCommune(
      input.surface_m2, codeInsee, input.code_postal, input.prix,
    );

    const apartment = await createApartment({
      ...input,
      frais_notaire_estimes: fraisNotaire,
      taxe_fonciere: taxeFonciere,
      charges_copro_annuelles: chargesCopro,
      assurance_annuelle: assuranceAnnuelle,
      latitude,
      longitude,
      precision_localisation: precision,
      code_insee: codeInsee,
      champs_manuels: champsManuelsAtCreation,
    });

    revalidatePath("/");
    return NextResponse.json(
      { apartment: computeDerived(apartment) },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
