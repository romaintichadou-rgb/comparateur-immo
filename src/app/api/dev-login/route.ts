import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const email = process.env.DEV_EMAIL;
  const password = process.env.DEV_PASSWORD;

  if (!email || !password) {
    return NextResponse.json(
      { error: "DEV_EMAIL / DEV_PASSWORD manquants dans .env.local" },
      { status: 500 },
    );
  }

  const suivant = request.nextUrl.searchParams.get("suivant") ?? "/";
  const dest =
    suivant.startsWith("/") && !suivant.startsWith("//") ? suivant : "/";

  const url = request.nextUrl.clone();
  url.pathname = dest;
  url.search = "";
  const response = NextResponse.redirect(url);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json(
      { error: `Dev login failed: ${error.message}` },
      { status: 500 },
    );
  }

  return response;
}
