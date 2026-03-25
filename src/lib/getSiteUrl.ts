/**
 * Returns the canonical site URL for redirects and email links.
 *
 * - In production (myco-op.co.za domain): uses the actual origin
 * - In development / preview: falls back to window.location.origin
 *
 * For tenant-specific URLs, pass the tenant slug to get e.g. https://aem.myco-op.co.za
 */

const PRODUCTION_DOMAIN = "myco-op.co.za";

function isOnProductionDomain(): boolean {
  return window.location.hostname.endsWith(PRODUCTION_DOMAIN);
}

export function getSiteUrl(tenantSlug?: string | null): string {
  if (isOnProductionDomain()) {
    return window.location.origin;
  }

  if (tenantSlug) {
    return `https://${tenantSlug}.${PRODUCTION_DOMAIN}`;
  }

  if (isOnProductionDomain()) {
    return `https://www.${PRODUCTION_DOMAIN}`;
  }

  return window.location.origin;
}

/**
 * Navigate to a tenant's landing page.
 * In production → redirects to https://{slug}.myco-op.co.za
 * In dev/preview → uses path-based /t/{slug}
 */
export function getTenantUrl(slug: string): string {
  if (isOnProductionDomain()) {
    return `https://${slug}.${PRODUCTION_DOMAIN}`;
  }
  return `/t/${slug}`;
}

/**
 * Navigate to a tenant URL. In production this does a full redirect
 * to the subdomain; in dev it returns a path for react-router navigate().
 */
export function navigateToTenant(slug: string, navigate: (path: string, opts?: any) => void, opts?: { replace?: boolean }) {
  if (isOnProductionDomain()) {
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
