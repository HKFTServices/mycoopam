/**
 * Returns the canonical site URL for redirects and email links.
 *
 * Always returns the production domain (myco-op.co.za) for redirects and emails.
 * For tenant-specific URLs, pass the tenant slug to get e.g. https://aem.myco-op.co.za
 */

const PRODUCTION_DOMAIN = "myco-op.co.za";

export function isOnProductionDomain(): boolean {
  return window.location.hostname.endsWith(PRODUCTION_DOMAIN);
}

export function getSiteUrl(tenantSlug?: string | null): string {
  // If we're on a tenant subdomain, use that origin
  if (isOnProductionDomain()) {
    return window.location.origin;
  }

  // Not on production domain (e.g. Lovable preview) — always use production URLs
  if (tenantSlug) {
    return `https://${tenantSlug}.${PRODUCTION_DOMAIN}`;
  }

  return `https://www.${PRODUCTION_DOMAIN}`;
}

/**
 * Get the URL for a tenant's landing page.
 * Always returns the production subdomain URL.
 */
export function getTenantUrl(slug: string): string {
  return `https://${slug}.${PRODUCTION_DOMAIN}`;
}

/**
 * Navigate to a tenant URL. Always does a full redirect to the production subdomain.
 */
export function navigateToTenant(slug: string, navigate: (path: string, opts?: any) => void, opts?: { replace?: boolean }) {
  const url = `https://${slug}.${PRODUCTION_DOMAIN}`;
  if (opts?.replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}
