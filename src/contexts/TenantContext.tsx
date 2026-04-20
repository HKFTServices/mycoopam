import { createContext, useContext, useState, useEffect, useLayoutEffect, useRef, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { fetchTenantBySlug, getTenantSlugFromSubdomain } from "@/lib/tenantResolver";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { Tables } from "@/integrations/supabase/types";

type Tenant = Tables<"tenants">;

interface TenantBranding {
  legalEntityName: string | null;
  logoUrl: string | null;
  themePrimaryHsl: string | null;
  themeAccentHsl: string | null;
  themeSidebarHsl: string | null;
}

interface TenantCompany {
  name: string;
  logoUrl: string | null;
}

const defaultBranding: TenantBranding = {
  legalEntityName: null,
  logoUrl: null,
  themePrimaryHsl: null,
  themeAccentHsl: null,
  themeSidebarHsl: null,
};

interface TenantContextType {
  tenants: Tenant[];
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant) => void;
  loading: boolean;
  branding: TenantBranding;
  company: TenantCompany;
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  currentTenant: null,
  setCurrentTenant: () => {},
  loading: true,
  branding: defaultBranding,
  company: { name: "MyCo-op", logoUrl: null },
});

export const useTenant = () => useContext(TenantContext);

// Apply tenant theme CSS variables to the document root
const applyTheme = (branding: TenantBranding) => {
  const root = document.documentElement;

  if (branding.themePrimaryHsl) {
    root.style.setProperty("--primary", branding.themePrimaryHsl);
    root.style.setProperty("--ring", branding.themePrimaryHsl);
  } else {
    root.style.removeProperty("--primary");
    root.style.removeProperty("--ring");
  }

  if (branding.themeAccentHsl) {
    root.style.setProperty("--accent", branding.themeAccentHsl);
  } else {
    root.style.removeProperty("--accent");
  }

  if (branding.themeSidebarHsl) {
    root.style.setProperty("--sidebar-background", branding.themeSidebarHsl);
    // Pick readable sidebar foreground colors based on lightness.
    // branding.themeSidebarHsl is expected to be "H S% L%".
    const parts = branding.themeSidebarHsl.trim().split(/\s+/);
    const lightnessPart = parts[2] || "";
    const lightness = Number(lightnessPart.replace("%", ""));
    const isDark = !Number.isNaN(lightness) ? lightness < 50 : false;

    if (isDark) {
      root.style.setProperty("--sidebar-foreground", "0 0% 98%");
      root.style.setProperty("--sidebar-accent", "222 40% 13%");
      root.style.setProperty("--sidebar-accent-foreground", "0 0% 98%");
      root.style.setProperty("--sidebar-border", "222 35% 15%");
    } else {
      root.style.setProperty("--sidebar-foreground", "222 47% 11%");
      root.style.setProperty("--sidebar-accent", "220 16% 93%");
      root.style.setProperty("--sidebar-accent-foreground", "222 47% 11%");
      root.style.setProperty("--sidebar-border", "220 16% 90%");
    }
  } else {
    root.style.removeProperty("--sidebar-background");
    root.style.removeProperty("--sidebar-foreground");
    root.style.removeProperty("--sidebar-accent");
    root.style.removeProperty("--sidebar-accent-foreground");
    root.style.removeProperty("--sidebar-border");
  }
};

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const location = useLocation();
  const lastPublicSlugRef = useRef<string | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<TenantBranding>(defaultBranding);

  useEffect(() => {
    const resetToDefault = (nextLoading = false) => {
      setTenants([]);
      setCurrentTenant(null);
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
      setLoading(nextLoading);
    };

    if (!user) {
      const slugFromSubdomain = getTenantSlugFromSubdomain();
      const slugFromPath = window.location.pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
      const slug = slugFromSubdomain || slugFromPath || localStorage.getItem("tenantSlug");
      resetToDefault(!!slug);
      return;
    }

    let cancelled = false;
    const fetchTenants = async () => {
      // Only fetch tenants where the user has an active membership
      const { data: memberships } = await (supabase as any)
        .from("tenant_memberships")
        .select("tenant_id")
        .eq("user_id", user.id)
        .eq("is_active", true);
      
      const memberTenantIds = (memberships ?? []).map((m: any) => m.tenant_id);

      // Also check for super_admin — they can see all tenants
      const { data: superCheck } = await supabase
        .from("user_roles")
        .select("id")
        .eq("user_id", user.id)
        .eq("role", "super_admin" as any)
        .limit(1);
      const isSuperAdmin = (superCheck ?? []).length > 0;

      let list: Tenant[] = [];
      if (isSuperAdmin) {
        const { data } = await supabase.from("tenants").select("*").eq("is_active", true);
        list = data ?? [];
      } else if (memberTenantIds.length > 0) {
        const { data } = await supabase.from("tenants").select("*").in("id", memberTenantIds);
        list = data ?? [];
      }

      // Fallback: if no memberships found yet but we have a saved tenant ID
      // (e.g. race condition during signup — membership created after this query ran),
      // fetch that tenant directly so the user isn't left with a null context.
      const savedId = localStorage.getItem("currentTenantId");
      if (list.length === 0 && savedId && !isSuperAdmin) {
        const { data: fallbackTenant } = await supabase
          .from("tenants")
          .select("*")
          .eq("id", savedId)
          .eq("is_active", true)
          .maybeSingle();
        if (fallbackTenant) {
          list = [fallbackTenant];
        }
      }

      // Also check tenantSlug fallback (subdomain/path-based signup)
      const tenantSlug = localStorage.getItem("tenantSlug");
      if (list.length === 0 && tenantSlug && !isSuperAdmin) {
        const { data: slugTenant } = await supabase
          .from("tenants")
          .select("*")
          .eq("slug", tenantSlug)
          .eq("is_active", true)
          .maybeSingle();
        if (slugTenant) {
          list = [slugTenant];
          localStorage.setItem("currentTenantId", slugTenant.id);
        }
      }

      if (cancelled) return;
      setTenants(list);

      // If on a tenant subdomain, force that tenant regardless of localStorage
      const subdomainSlug = getTenantSlugFromSubdomain();
      if (subdomainSlug) {
        const subdomainTenant = list.find((t) => t.slug === subdomainSlug);
        if (subdomainTenant) {
          setCurrentTenant(subdomainTenant);
          localStorage.setItem("currentTenantId", subdomainTenant.id);
          setLoading(false);
          return;
        }
      }

      // Check for pending tenant slug (from registration flow)
      const pendingSlug = localStorage.getItem("pendingTenantSlug");
      if (pendingSlug) {
        const pendingTenant = list.find((t) => t.slug === pendingSlug);
        if (pendingTenant) {
          setCurrentTenant(pendingTenant);
          localStorage.setItem("currentTenantId", pendingTenant.id);
          localStorage.removeItem("pendingTenantSlug");
          setLoading(false);
          return;
        }
      }

      // restore saved tenant or pick first
      const restoredId = localStorage.getItem("currentTenantId");
      const saved = list.find((t) => t.id === restoredId);
      setCurrentTenant(saved ?? list[0] ?? null);
      setLoading(false);
    };

    fetchTenants();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Prevent a "flash" of the previous tenant branding when switching tenant login pages.
  useLayoutEffect(() => {
    if (user) return;

    const slugFromSubdomain = getTenantSlugFromSubdomain();
    const slugFromPath = location.pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
    const slug = slugFromSubdomain || slugFromPath || localStorage.getItem("tenantSlug");

    if (slug !== lastPublicSlugRef.current) {
      lastPublicSlugRef.current = slug;
      setTenants([]);
      setCurrentTenant(null);
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
      setLoading(!!slug);
    }
  }, [location.pathname, user]);

  // Resolve tenant branding for public pages (login), and keep it in sync when switching tenants.
  useEffect(() => {
    if (user) return;
    let cancelled = false;

    const resetToDefault = () => {
      setTenants([]);
      setCurrentTenant(null);
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
      setLoading(false);
    };

    const slugFromSubdomain = getTenantSlugFromSubdomain();
    const slugFromPath = location.pathname.match(/^\/t\/([^/]+)/)?.[1] ?? null;
    const slug = slugFromSubdomain || slugFromPath || localStorage.getItem("tenantSlug");

    if (!slug) {
      resetToDefault();
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    const resolvePublicTenant = async () => {
      const tenant = await fetchTenantBySlug(slug);
      if (cancelled) return;
      if (!tenant) {
        resetToDefault();
        return;
      }

      setTenants([tenant]);
      setCurrentTenant(tenant);
      localStorage.setItem("tenantSlug", slug);

      const newBranding: TenantBranding = {
        legalEntityName: (tenant as any).legal_name ?? tenant.name ?? null,
        logoUrl: (tenant as any).logo_url ?? null,
        themePrimaryHsl: null,
        themeAccentHsl: null,
        themeSidebarHsl: null,
      };
      setBranding(newBranding);
      applyTheme(newBranding);
      setLoading(false);
    };
    void resolvePublicTenant();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, user]);

  // Fetch branding (legal entity name + logo + theme) when tenant changes
  useEffect(() => {
    if (!currentTenant) {
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
      return;
    }
    if (!user) {
      // Public pages (tenant login) use branding resolved via `fetchTenantBySlug`.
      return;
    }
    const fetchBranding = async () => {
      const { data: config } = await (supabase as any)
        .from("tenant_configuration")
        .select("legal_entity_id, logo_url, theme_primary_hsl, theme_accent_hsl, theme_sidebar_hsl")
        .eq("tenant_id", currentTenant.id)
        .maybeSingle();

      let legalEntityName: string | null = null;
      if (config?.legal_entity_id) {
        const { data: entity } = await supabase
          .from("entities")
          .select("name")
          .eq("id", config.legal_entity_id)
          .maybeSingle();
        legalEntityName = entity?.name ?? null;
      }
      const newBranding: TenantBranding = {
        legalEntityName,
        logoUrl: config?.logo_url ?? null,
        themePrimaryHsl: config?.theme_primary_hsl ?? null,
        themeAccentHsl: config?.theme_accent_hsl ?? null,
        themeSidebarHsl: config?.theme_sidebar_hsl ?? null,
      };
      setBranding(newBranding);
      applyTheme(newBranding);
    };
    fetchBranding();
  }, [currentTenant?.id, user]);

  const handleSetTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    localStorage.setItem("currentTenantId", tenant.id);
  };

  const company: TenantCompany = {
    name: branding.legalEntityName ?? currentTenant?.name ?? "MyCo-op",
    logoUrl: branding.logoUrl ?? (currentTenant as any)?.logo_url ?? null,
  };

  // Dynamically swap the browser favicon to the tenant logo (falls back to default)
  useEffect(() => {
    const DEFAULT_FAVICON = "/favicon.png";
    const tenantLogo = company.logoUrl;

    const setIconHref = (href: string, type?: string) => {
      const head = document.head;
      // Remove all existing icon links to avoid the browser preferring the static one
      head.querySelectorAll("link[rel~='icon']").forEach((el) => el.parentNode?.removeChild(el));
      const link = document.createElement("link");
      link.rel = "icon";
      if (type) link.type = type;
      link.href = href;
      head.appendChild(link);
    };

    if (tenantLogo) {
      // Most tenant logos are PNG; let the browser sniff if not.
      setIconHref(tenantLogo);
    } else {
      setIconHref(DEFAULT_FAVICON, "image/png");
    }
  }, [company.logoUrl]);

  return (
    <TenantContext.Provider
      value={{ tenants, currentTenant, setCurrentTenant: handleSetTenant, loading, branding, company }}
    >
      {children}
    </TenantContext.Provider>
  );
};
