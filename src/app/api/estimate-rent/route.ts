import { NextRequest, NextResponse } from "next/server";
import { reponseErreur } from "../erreurs";
import { NonAuthentifieError } from "@/lib/auth";
import { ApartmentIntrouvableError, requireApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { reestimerLoyer } from "@/lib/reestimation";

/**
 * Ré-estime le loyer d'UN bien (bouton « Estimer avec IA »). Le corps métier
 * vit dans `reestimation.ts`, partagé avec le recalcul en chaîne
 * (`/api/apartments/[id]/recalc`) : une seule définition de ce qu'est une
 * ré-estimation de loyer, quel que soit le geste qui la déclenche.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const apartmentId = typeof body?.apartmentId === "string" ? body.apartmentId : "";
  if (!apartmentId) {
    return NextResponse.json({ error: "apartmentId manquant" }, { status: 400 });
  }

  try {
    const apartment = await requireApartment(apartmentId);
    const updated = await reestimerLoyer(apartment);
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    // Testés AVANT le message générique ci-dessous : sans ça, un utilisateur
    // simplement déconnecté — ou un identifiant de bien périmé — lirait
    // « Vérifie GEMINI_API_KEY », et chercherait une panne de clé d'API là où
    // il suffit de se reconnecter ou de rafraîchir la page.
    if (err instanceof NonAuthentifieError || err instanceof ApartmentIntrouvableError) {
      return reponseErreur(err);
    }

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
