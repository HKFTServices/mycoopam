/**
 * Returns the canonical site URL for redirects and email links.
 *
 * - In production (myco-op.co.za domain): uses the actual origin
 * - In development / preview: falls back to window.location.origin
 *
 * For tenant-specific URLs, pass the tenant slug to get e.g. https://aem.myco-op.co.za
 */

const PRODUCTION_DOMAIN = "myco-op.co.za";

export function getSiteUrl(tenantSlug?: string | null): string {
  const hostname = window.location.hostname;

  // If we're on the production domain already, use the real origin
  if (hostname.endsWith(PRODUCTION_DOMAIN)) {
    return window.location.origin;
  }

  // In production context but called with a tenant slug
  if (tenantSlug) {
    return `https://${tenantSlug}.${PRODUCTION_DOMAIN}`;
  }

  // Default production root
  if (import.meta.env.PROD) {
    return `https://www.${PRODUCTION_DOMAIN}`;
  }

  // Dev / preview fallback
  return window.location.origin;
}
