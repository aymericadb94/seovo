import { createClient as createServerClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET() {
  try {
    // Vérifier que c'est bien l'admin
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== process.env.ADMIN_EMAIL) {
      return Response.json({ error: "Accès refusé" }, { status: 403 });
    }

    const admin = createAdminClient();

    // Tous les utilisateurs
    const { data: usersData } = await admin.auth.admin.listUsers();
    const users = usersData?.users ?? [];

    // Tous les sites
    const { data: sites } = await admin.from("sites").select("*").order("created_at", { ascending: false });

    // Toutes les publications IA
    const { data: publications } = await admin.from("publications").select("*").order("published_at", { ascending: false });

    // Inscriptions par jour sur 30 jours
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const signupsByDay: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      signupsByDay[key] = 0;
    }
    users.forEach((u) => {
      const d = new Date(u.created_at);
      if (d >= thirtyDaysAgo) {
        const key = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
        if (key in signupsByDay) signupsByDay[key]++;
      }
    });
    const signupsChart = Object.entries(signupsByDay).map(([date, count]) => ({ date, count }));

    // Publications par jour sur 14 jours
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const pubsByDay: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
      pubsByDay[key] = 0;
    }
    (publications ?? []).forEach((p) => {
      const d = new Date(p.published_at);
      if (d >= fourteenDaysAgo) {
        const key = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
        if (key in pubsByDay) pubsByDay[key]++;
      }
    });
    const pubsChart = Object.entries(pubsByDay).map(([date, count]) => ({ date, count }));

    // Derniers inscrits (10)
    const recentUsers = users
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        hasSite: (sites ?? []).some((s) => s.user_id === u.id),
      }));

    return Response.json({
      stats: {
        totalUsers: users.length,
        totalSites: (sites ?? []).length,
        totalPublications: (publications ?? []).length,
        newUsersThisMonth: users.filter((u) => new Date(u.created_at) >= thirtyDaysAgo).length,
      },
      signupsChart,
      pubsChart,
      recentUsers,
      recentPublications: (publications ?? []).slice(0, 8),
      recentSites: (sites ?? []).slice(0, 5),
    });
  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : "Erreur" }, { status: 500 });
  }
}
