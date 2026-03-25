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

/**
 * Navigate to a tenant's landing page.
 * In production → redirects to https://{slug}.myco-op.co.za
 * In dev/preview → uses path-based /t/{slug}
 */
export function getTenantUrl(slug: string): string {
  if (import.meta.env.PROD) {
    return `https://${slug}.${PRODUCTION_DOMAIN}`;
  }
  // Dev fallback: path-based routing still works in preview
  return `/t/${slug}`;
}

/**
 * Navigate to a tenant URL. In production this does a full redirect
 * to the subdomain; in dev it returns a path for react-router navigate().
 */
export function navigateToTenant(slug: string, navigate: (path: string, opts?: any) => void, opts?: { replace?: boolean }) {
  if (import.meta.env.PROD) {
    const url = `https://${slug}.${PRODUCTION_DOMAIN}`;
    if (opts?.replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
  } else {
    navigate(`/t/${slug}`, opts);
  }
}
