/**
 * Shopify API helper — centralizes version, auth headers, and fetch logic.
 *
 * Shopify deprecates API versions after ~12 months.
 * This module tries multiple versions on the first call and caches the working one.
 */

const SHOPIFY_API_VERSIONS = ["2026-01", "2025-10", "2025-07", "2025-04", "2025-01", "2024-10"] as const;

let _cachedVersion: string | null = null;

/**
 * Make an authenticated Shopify Admin API call.
 * Automatically discovers the correct API version on first call.
 */
export async function shopifyFetch(
  storeUrl: string,
  apiKey: string,
  endpoint: string,
  options?: { method?: string; body?: string }
): Promise<Response> {
  const baseUrl = storeUrl.replace(/\/$/, "");
  const headers: Record<string, string> = {
    "X-Shopify-Access-Token": apiKey,
    "Content-Type": "application/json",
  };
  const method = options?.method ?? "GET";

  // If we already found a working version, use it directly
  if (_cachedVersion) {
    return fetch(`${baseUrl}/admin/api/${_cachedVersion}/${endpoint}`, {
      method,
      headers,
      ...(options?.body ? { body: options.body } : {}),
      redirect: "follow",
    });
  }

  // Discovery: try versions until one works
  let lastResponse: Response | null = null;
  for (const version of SHOPIFY_API_VERSIONS) {
    try {
      const res = await fetch(`${baseUrl}/admin/api/${version}/${endpoint}`, {
        method,
        headers,
        ...(options?.body ? { body: options.body } : {}),
        redirect: "follow",
      });

      // 401/403 means auth failed — no point trying other versions
      if (res.status === 401 || res.status === 403) {
        return res;
      }

      // 404 might mean this API version doesn't exist, try next
      if (res.status === 404) {
        lastResponse = res;
        continue;
      }

      // Any other response (200, 201, 4xx, 5xx) — this version works
      _cachedVersion = version;
      console.log(`[shopify] Discovered working API version: ${version}`);
      return res;
    } catch {
      continue;
    }
  }

  // Return the last response we got (likely 404) or throw
  if (lastResponse) return lastResponse;
  throw new Error(`Impossible de joindre ${baseUrl} — vérifiez l'URL .myshopify.com`);
}

/**
 * Test the Shopify connection. Returns the working API version or an error.
 */
export async function testShopifyConnection(
  storeUrl: string,
  apiKey: string
): Promise<{ ok: true; api_version: string } | { ok: false; reason: string }> {
  const baseUrl = storeUrl.replace(/\/$/, "");

  for (const version of SHOPIFY_API_VERSIONS) {
    try {
      const res = await fetch(`${baseUrl}/admin/api/${version}/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": apiKey,
          "Content-Type": "application/json",
        },
        redirect: "follow",
      });

      if (res.ok) {
        _cachedVersion = version;
        return { ok: true, api_version: version };
      }

      if (res.status === 401 || res.status === 403) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          reason: `Clé API invalide ou permissions insuffisantes (${res.status}). Vérifiez les scopes read_content et write_content.${body ? ` Détail: ${body.slice(0, 150)}` : ""}`,
        };
      }

      // 404 = version might not exist, try next
      if (res.status === 404) continue;

      // Other error
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `Erreur Shopify (${res.status}): ${body.slice(0, 200)}`,
      };
    } catch (err) {
      // Network error on this version, try next
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
        return { ok: false, reason: `URL introuvable: "${baseUrl}". Vérifiez l'orthographe de votre URL .myshopify.com.` };
      }
      continue;
    }
  }

  return {
    ok: false,
    reason: `Aucune version API Shopify ne répond pour "${baseUrl}". Vérifiez que l'URL est correcte.`,
  };
}
