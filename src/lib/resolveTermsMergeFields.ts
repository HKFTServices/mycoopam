/**
 * Resolves merge-field placeholders in Terms & Conditions content.
 *
 * Supported fields:
 *  - {{tenant_name}}       → full legal-entity name (falls back to tenant short name)
 *  - {{tenant_short_name}} → tenant.name (the short / trading name)
 *  - {{tenant_slug}}       → tenant.slug (URL-safe identifier)
 */
export interface TermsMergeContext {
  tenantName?: string | null;       // short name from tenants table
  legalEntityName?: string | null;  // full legal name from tenant_configuration
  tenantSlug?: string | null;       // slug
}

const FIELD_MAP: Record<string, (ctx: TermsMergeContext) => string> = {
  tenant_name: (ctx) => ctx.legalEntityName || ctx.tenantName || "",
  tenant_short_name: (ctx) => ctx.tenantName || "",
  tenant_slug: (ctx) => ctx.tenantSlug || "",
};

export function resolveTermsMergeFields(
  html: string,
  ctx: TermsMergeContext,
): string {
  if (!html) return html;
  return html.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const resolver = FIELD_MAP[key];
    return resolver ? resolver(ctx) : match; // leave unknown tags untouched
  });
}
