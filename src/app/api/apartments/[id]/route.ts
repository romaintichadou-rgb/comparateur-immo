import { NextRequest, NextResponse } from "next/server";
import { reponseErreur } from "../../erreurs";
import { revalidatePath } from "next/cache";
import { deleteApartment, getApartment } from "@/lib/db";
import { computeDerived } from "@/lib/calculations";
import { apartmentPatchSchema } from "@/lib/types";
import { appliquerPatch } from "@/lib/patchApartment";

export async function GET(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  // Cette route était la seule sans try/catch : `NonAuthentifieError`
  // remontait brute et Next.js répondait 500 à un simple défaut de session.
  try {
    const apartment = await getApartment(id);
    if (!apartment) {
      // Bien inexistant OU appartenant à un autre compte — `getApartment()`
      // filtre sur `user_id` et ne distingue pas les deux cas, exprès.
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    return NextResponse.json({ apartment: computeDerived(apartment) });
  } catch (err) {
    return reponseErreur(err);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
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

    // Badges « estimé », re-géocodage et suivi de l'emprunt sont portés par
    // `appliquerPatch` — partagé avec le recalcul en chaîne, qui écrit les
    // mêmes champs par un autre chemin.
    const updated = await appliquerPatch(id, parsed.data);

    revalidatePath("/");
    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    return reponseErreur(err);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  try {
    const supprime = await deleteApartment(id);
    if (!supprime) {
      // Même réponse que GET et PATCH sur un bien qu'on ne possède pas :
      // répondre « ok » ferait croire à une suppression qui n'a pas eu lieu.
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    revalidatePath("/");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return reponseErreur(err);
  }
}
