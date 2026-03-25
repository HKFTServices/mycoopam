import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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
}

const TenantContext = createContext<TenantContextType>({
  tenants: [],
  currentTenant: null,
  setCurrentTenant: () => {},
  loading: true,
  branding: defaultBranding,
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
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<TenantBranding>(defaultBranding);

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setCurrentTenant(null);
      setLoading(false);
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
      return;
    }

    const fetchTenants = async () => {
      const { data } = await supabase.from("tenants").select("*");
      let list = data ?? [];

      // Fallback for new users who have no tenant membership yet
      if (list.length === 0) {
        const { data: brandingData } = await supabase.rpc("get_tenant_branding" as any);
        if (brandingData && (brandingData as any[]).length > 0) {
          const fallbackTenants = (brandingData as any[]).map((b: any) => ({
            id: b.tenant_id,
            name: b.tenant_name,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })) as Tenant[];
          list = fallbackTenants;
        }
      }

      setTenants(list);

      // restore saved tenant or pick first
      const savedId = localStorage.getItem("currentTenantId");
      const saved = list.find((t) => t.id === savedId);
      setCurrentTenant(saved ?? list[0] ?? null);
      setLoading(false);
    };

    fetchTenants();
  }, [user]);

  // Fetch branding (legal entity name + logo + theme) when tenant changes
  useEffect(() => {
    if (!currentTenant) {
      setBranding(defaultBranding);
      applyTheme(defaultBranding);
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
  }, [currentTenant?.id]);

  const handleSetTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    localStorage.setItem("currentTenantId", tenant.id);
  };

  return (
    <TenantContext.Provider
      value={{ tenants, currentTenant, setCurrentTenant: handleSetTenant, loading, branding }}
    >
      {children}
    </TenantContext.Provider>
  );
};
