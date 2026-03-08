import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { Tables } from "@/integrations/supabase/types";

type Tenant = Tables<"tenants">;

interface TenantBranding {
  legalEntityName: string | null;
  logoUrl: string | null;
}

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
  branding: { legalEntityName: null, logoUrl: null },
});

export const useTenant = () => useContext(TenantContext);

export const TenantProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [branding, setBranding] = useState<TenantBranding>({ legalEntityName: null, logoUrl: null });

  useEffect(() => {
    if (!user) {
      setTenants([]);
      setCurrentTenant(null);
      setLoading(false);
      setBranding({ legalEntityName: null, logoUrl: null });
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

  // Fetch branding (legal entity name + logo) when tenant changes
  useEffect(() => {
    if (!currentTenant) {
      setBranding({ legalEntityName: null, logoUrl: null });
      return;
    }
    const fetchBranding = async () => {
      const { data: config } = await supabase
        .from("tenant_configuration")
        .select("legal_entity_id, logo_url")
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
      setBranding({ legalEntityName, logoUrl: config?.logo_url ?? null });
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
