import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a tenant by slug from either:
 * 1. Path-based routing: /t/aem → slug = "aem"
 * 2. Subdomain-based routing: aem.myco-op.co.za → slug = "aem"
 *
 * For now we use path-based. When going live with wildcard DNS (*.myco-op.co.za),
 * enable subdomain detection by setting VITE_TENANT_DOMAIN in env.
 */

const TENANT_DOMAIN = import.meta.env.VITE_TENANT_DOMAIN || "myco-op.co.za";

export function getTenantSlugFromSubdomain(): string | null {
  if (!TENANT_DOMAIN) return null;
  const hostname = window.location.hostname; // e.g. aem.myco-op.co.za
  if (hostname.endsWith(`.${TENANT_DOMAIN}`)) {
    const slug = hostname.replace(`.${TENANT_DOMAIN}`, "").split(".").pop();
    if (!slug || slug === "www") return null;
    return slug;
  }
  return null;
}

export async function fetchTenantBySlug(slug: string) {
  // First get the tenant row (public RLS policy allows this)
  const { data: tenant, error } = await (supabase as any)
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error) console.error("Tenant lookup error:", error);
  if (!tenant) return null;

  // Use security definer RPC to get branding (works for anon users)
  const { data: branding } = await supabase.rpc("get_tenant_branding_by_slug" as any, { p_slug: slug });
  if (branding && (branding as any[]).length > 0) {
    const b = (branding as any[])[0];
    if (b.logo_url) tenant.logo_url = b.logo_url;
    if (b.legal_name) tenant.legal_name = b.legal_name;
  }

  return tenant;
}
