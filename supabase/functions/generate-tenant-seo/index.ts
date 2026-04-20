// Generate per-tenant SEO (title, meta description, keywords + OG image) using
// Lovable AI Gateway. Super-admin only. Saves the result to public.tenant_seo.
//
// POST body: { tenant_id: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const STORAGE_BUCKET = "tenant-logos";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claimsData.claims.sub;

    // Super-admin check
    const { data: roleRow } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json({ error: "Super admin only" }, 403);

    const body = await req.json().catch(() => ({}));
    const tenantId: string | undefined = body?.tenant_id;
    if (!tenantId || typeof tenantId !== "string") {
      return json({ error: "tenant_id is required" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load tenant + branding info
    const { data: tenant, error: tErr } = await admin
      .from("tenants")
      .select("id, name, slug")
      .eq("id", tenantId)
      .maybeSingle();
    if (tErr || !tenant) return json({ error: "Tenant not found" }, 404);

    const { data: cfg } = await admin
      .from("tenant_configuration")
      .select("logo_url, legal_entity_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    let legalName = tenant.name;
    if (cfg?.legal_entity_id) {
      const { data: ent } = await admin
        .from("entities")
        .select("name")
        .eq("id", cfg.legal_entity_id)
        .maybeSingle();
      if (ent?.name) legalName = ent.name;
    }

    // 1) Generate title + description + keywords via tool calling
    const seoSystem =
      "You write concise, search-optimized SEO metadata for cooperative / investment-club websites.";
    const seoUser = `Generate SEO metadata for a cooperative called "${legalName}" (subdomain: ${tenant.slug}.myco-op.co.za). It is a member-owned cooperative offering pooled investments, member accounts, and financial administration. Title must be under 60 characters. Description must be under 160 characters and compel a click. Keywords: 6-10 comma-separated terms.`;

    const seoResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: seoSystem },
          { role: "user", content: seoUser },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_seo",
              description: "Save the generated SEO metadata.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Under 60 chars" },
                  description: { type: "string", description: "Under 160 chars" },
                  keywords: { type: "string", description: "Comma separated" },
                },
                required: ["title", "description", "keywords"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_seo" } },
      }),
    });

    if (!seoResp.ok) {
      const t = await seoResp.text();
      console.error("[generate-tenant-seo] Text gen error:", seoResp.status, t);
      if (seoResp.status === 429) return json({ error: "AI rate limit, try again shortly." }, 429);
      if (seoResp.status === 402) return json({ error: "AI credits exhausted." }, 402);
      return json({ error: "AI text generation failed" }, 500);
    }

    const seoData = await seoResp.json();
    const toolCall = seoData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ error: "AI did not return structured SEO" }, 500);
    }
    const seo = JSON.parse(toolCall.function.arguments) as {
      title: string;
      description: string;
      keywords: string;
    };

    // 2) Generate OG image (1200x630 hero)
    const imagePrompt = `Modern, clean Open Graph banner image (1200x630, landscape) for a cooperative investment club called "${legalName}". Centered prominent text: "${legalName}". Subtle abstract financial / community motif (gold and amber tones). Professional, premium look. No watermarks, no logos other than the name.`;

    let ogImageUrl: string | null = null;
    try {
      const imgResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: imagePrompt }],
          modalities: ["image", "text"],
        }),
      });

      if (imgResp.ok) {
        const imgData = await imgResp.json();
        const dataUrl: string | undefined =
          imgData?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (dataUrl?.startsWith("data:image/")) {
          // Decode base64 → upload to storage
          const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
          if (match) {
            const mime = match[1];
            const ext = mime.split("/")[1] === "jpeg" ? "jpg" : mime.split("/")[1];
            const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
            const path = `og/${tenant.slug}-${Date.now()}.${ext}`;
            const { error: upErr } = await admin.storage
              .from(STORAGE_BUCKET)
              .upload(path, bytes, { contentType: mime, upsert: true });
            if (!upErr) {
              const { data: pub } = admin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
              ogImageUrl = pub.publicUrl;
            } else {
              console.error("[generate-tenant-seo] Upload failed:", upErr);
            }
          }
        }
      } else {
        console.error("[generate-tenant-seo] Image gen non-OK:", imgResp.status);
      }
    } catch (imgErr) {
      console.error("[generate-tenant-seo] Image gen exception:", imgErr);
    }

    // Fallback to existing logo if AI image generation failed
    if (!ogImageUrl) ogImageUrl = cfg?.logo_url || null;

    // 3) Persist
    const { error: upsertErr } = await admin.from("tenant_seo").upsert(
      {
        tenant_id: tenantId,
        title: seo.title,
        description: seo.description,
        keywords: seo.keywords,
        og_image_url: ogImageUrl,
        generated_by_ai: true,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (upsertErr) {
      console.error("[generate-tenant-seo] Upsert failed:", upsertErr);
      return json({ error: "Failed to save SEO" }, 500);
    }

    return json({
      success: true,
      seo: {
        title: seo.title,
        description: seo.description,
        keywords: seo.keywords,
        og_image_url: ogImageUrl,
      },
    });
  } catch (err: any) {
    console.error("[generate-tenant-seo] Unhandled:", err);
    return json({ error: err?.message || "Unknown error" }, 500);
  }
});
