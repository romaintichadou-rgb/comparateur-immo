import { NextRequest, NextResponse } from "next/server";
import { deleteApartment, getApartment, updateApartment } from "@/lib/sheets";
import { computeDerived } from "@/lib/calculations";
import {
  CHAMPS_ESTIMABLES,
  ChampEstimable,
  apartmentPatchSchema,
} from "@/lib/types";

export async function GET(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  const apartment = await getApartment(id);
  if (!apartment) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  return NextResponse.json({ apartment: computeDerived(apartment) });
}

export async function PATCH(
  req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  try {
    const current = await getApartment(id);
    if (!current) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = apartmentPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Données invalides", issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const patch = parsed.data;

    // Toute modification manuelle d'un champ estimable désactive
    // définitivement son badge "estimé" (pas de réestimation automatique
    // future), sauf si le patch fournit explicitement champs_manuels
    // (ex: bouton "réestimer" qui remet un champ en mode estimé).
    let champsManuels: ChampEstimable[];
    if (patch.champs_manuels !== undefined) {
      champsManuels = patch.champs_manuels;
    } else {
      const nouveauxChampsManuels = (Object.keys(patch) as (keyof typeof patch)[])
        .filter((key): key is ChampEstimable =>
          (CHAMPS_ESTIMABLES as readonly string[]).includes(key)
        )
        .filter((key) => patch[key] !== current[key]);
      champsManuels = Array.from(
        new Set([...current.champs_manuels, ...nouveauxChampsManuels])
      );
    }

    const updated = await updateApartment(id, {
      ...patch,
      champs_manuels: champsManuels,
    });

    return NextResponse.json({ apartment: computeDerived(updated) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: RouteContext<"/api/apartments/[id]">
) {
  const { id } = await params;
  try {
    await deleteApartment(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur inconnue" },
      { status: 500 }
    );
  }
}
