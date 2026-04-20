// Dynamic Open Graph / SEO endpoint for tenant subdomains.
//
// Returns a small HTML document with per-tenant <title>, <meta description>,
// and Open Graph / Twitter card tags so that link previews on WhatsApp, Slack,
// LinkedIn, Facebook, X, iMessage, etc. show the correct tenant logo + name.
//
// Usage:
//   GET /functions/v1/tenant-og?slug=aem
//   GET /functions/v1/tenant-og?slug=aem&redirect=https://aem.myco-op.co.za
//
// When `redirect` is provided, real browsers (non-bots) get an immediate
// client-side redirect to that URL while crawlers see only the meta tags.
//
// Designed to be called either directly (share-friendly URL) or from a
// Cloudflare Worker that proxies social-bot requests on the tenant subdomain.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, user-agent",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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

function escapeAttr(value: string): string {
  return escapeHtml(value);
}

function renderHtml(opts: {
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  redirectUrl?: string;
}): string {
  const { title, description, imageUrl, canonicalUrl, redirectUrl } = opts;
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeImage = escapeAttr(imageUrl);
  const safeCanonical = escapeAttr(canonicalUrl);

  // Square logo previews look better with summary card; large hero image sites
  // can swap to summary_large_image. We use summary so the logo isn't cropped.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDesc}" />
    <link rel="canonical" href="${safeCanonical}" />

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="${safeTitle}" />
    <meta property="og:title" content="${safeTitle}" />
    <meta property="og:description" content="${safeDesc}" />
    <meta property="og:url" content="${safeCanonical}" />
    <meta property="og:image" content="${safeImage}" />
    <meta property="og:image:alt" content="${safeTitle} logo" />

    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${safeTitle}" />
    <meta name="twitter:description" content="${safeDesc}" />
    <meta name="twitter:image" content="${safeImage}" />

    ${redirectUrl ? `<meta http-equiv="refresh" content="0; url=${escapeAttr(redirectUrl)}" />` : ""}
  </head>
  <body style="font-family: system-ui, sans-serif; padding: 24px; text-align: center;">
    <img src="${safeImage}" alt="${safeTitle}" style="max-width: 200px; height: auto;" />
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

    // Allow detection from Host header too: aem.myco-op.co.za -> "aem"
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
    const tenantName: string =
      row?.legal_name || row?.tenant_name || "MyCoop Cooperative";
    const logoUrl: string = row?.logo_url || FALLBACK_LOGO;

    const description = `Sign in or apply for membership at ${tenantName}. Pooled investments, member accounts, and financial administration.`;

    const canonicalUrl = `https://${slug}.${PROD_DOMAIN}/`;
    const safeRedirect =
      redirectParam && /^https?:\/\//i.test(redirectParam)
        ? redirectParam
        : undefined;

    const html = renderHtml({
      title: tenantName,
      description,
      imageUrl: logoUrl,
      canonicalUrl,
      redirectUrl: safeRedirect,
    });

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        // Cache at the edge for 10 min so repeat scrapes are cheap;
        // tenant logo changes will propagate within the TTL.
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
