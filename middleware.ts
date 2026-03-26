import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Routes protégées — redirige vers login si non connecté
  const protectedRoutes = ["/dashboard", "/generate", "/onboarding", "/settings", "/admin"];
  const isProtected = protectedRoutes.some((r) => path.startsWith(r));
  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirige login/signup vers dashboard si déjà connecté
  if ((path === "/login" || path === "/signup") && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Si connecté et accède au dashboard → vérifie si onboarding fait
  if (user && path.startsWith("/dashboard")) {
    const { data: sites } = await supabase
      .from("sites")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);

    if (!sites || sites.length === 0) {
      return NextResponse.redirect(new URL("/onboarding", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/dashboard/:path*", "/generate/:path*", "/onboarding/:path*", "/onboarding", "/settings/:path*", "/settings", "/admin/:path*", "/admin", "/login", "/signup"],
};
