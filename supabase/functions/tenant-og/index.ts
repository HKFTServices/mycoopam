// Dynamic Open Graph / SEO endpoint for tenant subdomains.
//
// Returns a small HTML document with per-tenant <title>, <meta description>,
// and Open Graph / Twitter card tags so that link previews on WhatsApp, Slack,
// LinkedIn, Facebook, X, iMessage, etc. show the correct tenant logo + name.
//
// SEO source priority:
//   1. tenant_seo row (saved or AI-generated)
//   2. Auto-generated from tenant name + logo  → also persisted on first request
//   3. Global MyCoop fallback

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, user-agent",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PROD_DOMAIN = "myco-op.co.za";
const FALLBACK_LOGO =
  "https://yhzajyegudbecyjpznjr.supabase.co/storage/v1/object/public/tenant-logos/mycoop-og.png";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
const escapeAttr = escapeHtml;

function renderHtml(opts: {
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  keywords?: string;
  redirectUrl?: string;
}): string {
  const { title, description, imageUrl, canonicalUrl, keywords, redirectUrl } = opts;
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeAttr(imageUrl);
  const safeCanonical = escapeAttr(canonicalUrl);
  const safeKeywords = keywords ? escapeAttr(keywords) : "";

  // OG image is hero-sized (1200x630) so use summary_large_image.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    ${safeKeywords ? `<meta name="keywords" content="${safeKeywords}" />` : ""}
    <link rel="canonical" href="${safeCanonical}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${safeTitle}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle} logo" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />

    ${redirectUrl ? `<meta http-equiv="refresh" content="0; url=${escapeAttr(redirectUrl)}" />` : ""}
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center;">
    <img src="${safeImage}" alt="${safeTitle}" style="max-width: 320px; height: auto;" />
    <h1>${safeTitle}</h1>
    <p>${safeDesc}</p>
    ${redirectUrl ? `<p><a href="${escapeAttr(redirectUrl)}">Continue to site</a></p>` : ""}
  </body>
</html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let slug = (url.searchParams.get("slug") || "").trim().toLowerCase();
    const redirectParam = url.searchParams.get("redirect");

    if (!slug) {
      const host = req.headers.get("host") || "";
      if (host.endsWith(`.${PROD_DOMAIN}`)) {
        const sub = host.replace(`.${PROD_DOMAIN}`, "").split(".").pop() || "";
        if (sub && sub !== "www") slug = sub.toLowerCase();
      }
    }

    if (!slug || !/^[a-z0-9-]{1,32}$/.test(slug)) {
      return new Response("Invalid or missing slug", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "text/plain" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data, error } = await supabase.rpc("get_tenant_branding_by_slug", {
      p_slug: slug,
    });

    if (error) {
      console.error("[tenant-og] RPC error:", error);
    }

    const row = Array.isArray(data) && data.length > 0 ? (data[0] as any) : null;
    const tenantId: string | null = row?.tenant_id ?? null;
    const tenantName: string =
      row?.legal_name || row?.tenant_name || "MyCoop Cooperative";
    const logoUrl: string = row?.logo_url || FALLBACK_LOGO;

    // Resolve SEO using priority: saved → auto-generated (and persist)
    let title: string = row?.seo_title || tenantName;
    let description: string =
      row?.seo_description ||
      `Sign in or apply for membership at ${tenantName}. Pooled investments, member accounts, and financial administration.`;
    const ogImage: string = row?.seo_og_image_url || logoUrl;
    const keywords: string | undefined = row?.seo_keywords || undefined;

    // If tenant exists but has no SEO row, persist the auto-generated defaults so
    // admins can edit them later.
    if (tenantId && !row?.seo_title && SUPABASE_SERVICE_ROLE_KEY) {
      try {
        const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await admin.from("tenant_seo").upsert(
          {
            tenant_id: tenantId,
            title,
            description,
            og_image_url: ogImage,
            generated_by_ai: false,
          },
          { onConflict: "tenant_id" },
        );
      } catch (persistErr) {
        console.error("[tenant-og] Failed to persist defaults:", persistErr);
      }
    }

    const canonicalUrl = `https://${slug}.${PROD_DOMAIN}/`;
    const safeRedirect =
      redirectParam && /^https?:\/\//i.test(redirectParam)
        ? redirectParam
        : undefined;

    const html = renderHtml({
      title,
      description,
      imageUrl: ogImage,
      canonicalUrl,
      keywords,
      redirectUrl: safeRedirect,
    });

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch (err: any) {
    console.error("[tenant-og] Unhandled error:", err);
    return new Response(`Error: ${err?.message || "unknown"}`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain" },
    });
  }
});
