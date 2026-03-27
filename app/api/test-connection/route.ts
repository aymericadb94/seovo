import { testWixConnection } from "@/lib/wix";

export async function POST(request: Request) {
  try {
    const { cms, siteUrl, wpUsername, wpAppPassword, shopifyApiKey, wixApiKey, wixSiteId } = await request.json();

    if (!cms || !siteUrl) {
      return Response.json({ ok: false, reason: "URL du site manquante" }, { status: 400 });
    }

    if (cms === "wordpress") {
      if (!wpUsername || !wpAppPassword) {
        return Response.json({ ok: false, reason: "Identifiants WordPress manquants" }, { status: 400 });
      }
      const credentials = Buffer.from(`${wpUsername}:${wpAppPassword}`).toString("base64");
      const res = await fetch(`${siteUrl.replace(/\/$/, "")}/wp-json/wp/v2/posts?per_page=1`, {
        headers: {
          Authorization: `Basic ${credentials}`,
          "ngrok-skip-browser-warning": "true",
        },
      });
      if (res.ok) {
        return Response.json({ ok: true });
      }
      if (res.status === 401) {
        return Response.json({ ok: false, reason: "Identifiants incorrects (401)" });
      }
      if (res.status === 404) {
        return Response.json({ ok: false, reason: "API WordPress introuvable — vérifiez l'URL du site" });
      }
      return Response.json({ ok: false, reason: `Erreur ${res.status} — vérifiez l'URL et les identifiants` });
    }

    if (cms === "shopify") {
      if (!shopifyApiKey) {
        return Response.json({ ok: false, reason: "Clé API Shopify manquante" }, { status: 400 });
      }
      const baseUrl = siteUrl.replace(/\/$/, "");
      const res = await fetch(`${baseUrl}/admin/api/2024-01/shop.json`, {
        headers: { "X-Shopify-Access-Token": shopifyApiKey },
      });
      if (res.ok) {
        return Response.json({ ok: true });
      }
      if (res.status === 401 || res.status === 403) {
        return Response.json({ ok: false, reason: "Clé API invalide ou permissions insuffisantes" });
      }
      if (res.status === 404) {
        return Response.json({ ok: false, reason: "Boutique Shopify introuvable — vérifiez l'URL" });
      }
      return Response.json({ ok: false, reason: `Erreur ${res.status} — vérifiez l'URL et la clé API` });
    }

    if (cms === "wix") {
      if (!wixApiKey || !wixSiteId) {
        return Response.json({ ok: false, reason: "Clé API ou Site ID Wix manquant" }, { status: 400 });
      }
      const result = await testWixConnection(wixApiKey, wixSiteId);
      return Response.json(result);
    }

    return Response.json({ ok: false, reason: "CMS non supporté" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    if (msg.includes("fetch") || msg.includes("ENOTFOUND") || msg.includes("network")) {
      return Response.json({ ok: false, reason: "Impossible de joindre le site — vérifiez l'URL" });
    }
    return Response.json({ ok: false, reason: msg });
  }
}
