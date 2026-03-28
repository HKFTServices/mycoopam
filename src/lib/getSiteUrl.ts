/**
 * URL helpers for multi-tenant routing.
 *
 * Goals:
 * - Local development should use local base URLs (localhost / *.localhost).
 * - Production builds should use the canonical production domain for redirects & emails.
 */

const PROD_DOMAIN = import.meta.env.VITE_PROD_DOMAIN || "myco-op.co.za";
const TENANT_ROUTING = (import.meta.env.VITE_TENANT_ROUTING || (import.meta.env.DEV ? "path" : "subdomain")) as
  | "path"
  | "subdomain";
const DEV_TENANT_DOMAIN = import.meta.env.VITE_DEV_TENANT_DOMAIN || "localhost";

function getPortSuffix() {
  return window.location.port ? `:${window.location.port}` : "";
}

function getDevTenantOrigin(slug: string) {
  return `${window.location.protocol}//${slug}.${DEV_TENANT_DOMAIN}${getPortSuffix()}`;
}

export function isOnProductionDomain(): boolean {
  return window.location.hostname.endsWith(PROD_DOMAIN);
}

/**
 * Public (non-tenant) site URL.
 *
 * - Dev: `http(s)://localhost:<port>` when using subdomain routing, otherwise current origin.
 * - Prod: `https://www.<prod-domain>`.
 */
export function getPublicSiteUrl(): string {
  if (import.meta.env.DEV) {
    if (TENANT_ROUTING === "subdomain") {
      return `${window.location.protocol}//${DEV_TENANT_DOMAIN}${getPortSuffix()}`;
    }
    return window.location.origin;
  }
  return `https://www.${PROD_DOMAIN}`;
}

/**
 * Base site URL for auth redirects and emails.
 *
 * - Dev: uses the current origin by default (supports localhost and tenant.localhost).
 *   If `VITE_TENANT_ROUTING=subdomain` and a slug is provided, returns the tenant subdomain origin.
 * - Prod: returns the canonical production domain (tenant subdomain or www).
 */
export function getSiteUrl(tenantSlug?: string | null): string {
  if (import.meta.env.DEV) {
    if (tenantSlug && TENANT_ROUTING === "subdomain") {
      return getDevTenantOrigin(tenantSlug);
    }
    return window.location.origin;
  }

  if (tenantSlug) {
    return `https://${tenantSlug}.${PROD_DOMAIN}`;
  }

  return `https://www.${PROD_DOMAIN}`;
}

/**
 * Tenant landing URL.
 *
 * - Dev: either `/t/<slug>` (path routing) or `<slug>.localhost` (subdomain routing).
 * - Prod: `<slug>.<prod-domain>`.
 */
export function getTenantUrl(slug: string): string {
  if (import.meta.env.DEV) {
    if (TENANT_ROUTING === "subdomain") return getDevTenantOrigin(slug);
    return `${window.location.origin}/t/${slug}`;
  }
  return `https://${slug}.${PROD_DOMAIN}`;
}

/**
 * Navigate to a tenant URL with a full redirect.
 */
export function navigateToTenant(
  slug: string,
  navigate: (path: string, opts?: any) => void,
  opts?: { replace?: boolean },
) {
  const url = getTenantUrl(slug);
  if (import.meta.env.DEV && TENANT_ROUTING === "path") {
    navigate(`/t/${slug}`, { replace: !!opts?.replace });
    return;
  }
  if (opts?.replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}
