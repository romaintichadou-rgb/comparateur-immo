import { NextRequest, NextResponse } from "next/server";
import { reponseErreur } from "../erreurs";
import { getSettings, updateSettings } from "@/lib/db";
import { settingsPatchSchema } from "@/lib/settings";

export async function GET() {
  try {
    const settings = await getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    return reponseErreur(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = settingsPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    }
    const settings = await updateSettings(parsed.data);
    return NextResponse.json({ settings });
  } catch (err) {
    return reponseErreur(err);
  }
}
