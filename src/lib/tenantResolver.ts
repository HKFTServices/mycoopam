import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a tenant by slug from either:
 * 1. Path-based routing: /t/aem → slug = "aem"
 * 2. Subdomain-based routing: aem.mycoop.co.za → slug = "aem"
 *
 * For now we use path-based. When going live with wildcard DNS (*.mycoop.co.za),
 * enable subdomain detection by setting VITE_TENANT_DOMAIN in env.
 */

const TENANT_DOMAIN = import.meta.env.VITE_TENANT_DOMAIN; // e.g. "mycoop.co.za"

export function getTenantSlugFromSubdomain(): string | null {
  if (!TENANT_DOMAIN) return null;
  const hostname = window.location.hostname; // e.g. aem.mycoop.co.za
  if (hostname.endsWith(`.${TENANT_DOMAIN}`)) {
    const slug = hostname.replace(`.${TENANT_DOMAIN}`, "").split(".").pop();
    return slug || null;
  }
  return null;
}

export async function fetchTenantBySlug(slug: string) {
  const { data, error } = await (supabase as any)
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) console.error("Tenant lookup error:", error);
  if (!data) return null;

  // If logo_url or legal_name missing on tenant, try tenant_configuration
  if (!data.logo_url || !data.legal_name) {
    const { data: config } = await supabase
      .from("tenant_configuration")
      .select("logo_url, legal_entity_id")
      .eq("tenant_id", data.id)
      .maybeSingle();

    if (config?.logo_url && !data.logo_url) {
      data.logo_url = config.logo_url;
    }
    if (config?.legal_entity_id && !data.legal_name) {
      const { data: entity } = await supabase
        .from("entities")
        .select("name")
        .eq("id", config.legal_entity_id)
        .maybeSingle();
      if (entity?.name) data.legal_name = entity.name;
    }
  }

  return data;
}
